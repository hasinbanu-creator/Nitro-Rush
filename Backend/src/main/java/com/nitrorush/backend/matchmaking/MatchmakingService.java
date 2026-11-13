package com.nitrorush.backend.matchmaking;

import com.nitrorush.backend.common.TimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.MatchmakingStatusPayload;
import com.nitrorush.backend.room.MessageBroadcaster;
import com.nitrorush.backend.room.Room;
import com.nitrorush.backend.room.RoomManager;
import com.nitrorush.backend.session.GuestSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Thread-safe authoritative matchmaking service managing the global FIFO player queue.
 *
 * Rules:
 * - Minimum 2 players, maximum 8 players.
 * - Global FIFO queue ordering.
 * - Once >= 2 players are waiting, begins a 15-second collection window.
 * - Additional players may join during that window; the deadline is NOT reset.
 * - Starts immediately when 8 eligible players are ready.
 * - If eligible players drop below 2 before race creation, pending start is cancelled.
 * - Prevents a player or session from entering multiple queues or rooms simultaneously.
 */
@Service
public class MatchmakingService {

    private static final Logger log = LoggerFactory.getLogger(MatchmakingService.class);

    public static final int MIN_PLAYERS = 2;
    public static final int MAX_PLAYERS = 8;
    public static final long COLLECTION_WINDOW_DURATION_MS = 15_000L;

    public static final String STATUS_QUEUED = "QUEUED";
    public static final String STATUS_COLLECTION_WINDOW = "COLLECTION_WINDOW";
    public static final String STATUS_MATCHED = "MATCHED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    private final RoomManager roomManager;
    private final TimeProvider timeProvider;
    private final MessageBroadcaster broadcaster;

    private final Object lock = new Object();
    private final List<QueuedPlayer> queue = new ArrayList<>();
    private final Map<String, QueuedPlayer> playersByToken = new HashMap<>();
    private final Map<String, QueuedPlayer> playersBySession = new HashMap<>();

    private long collectionDeadlineMs = 0L;
    private int lastBroadcastRemainingSec = -1;

    public MatchmakingService(RoomManager roomManager, TimeProvider timeProvider, MessageBroadcaster broadcaster) {
        this.roomManager = roomManager;
        this.timeProvider = timeProvider;
        this.broadcaster = broadcaster;
    }

    /**
     * Enqueues an authenticated guest player into the global matchmaking queue.
     */
    public void joinQueue(GuestSession guest, String preferredTrackId, String preferredCarId, String sessionId) {
        Objects.requireNonNull(guest, "guest must not be null");
        String token = guest.getGuestToken();

        // Check if player is already in an active room
        if (roomManager.findRoomByGuestToken(token).isPresent() ||
                (sessionId != null && roomManager.findRoomBySessionId(sessionId).isPresent())) {
            throw new ProtocolException(ErrorCode.ALREADY_IN_RACE,
                    "Player or session is already assigned to an active room");
        }

        List<QueuedPlayer> matchToCreate = null;

        synchronized (lock) {
            // Check if already in matchmaking queue
            if (playersByToken.containsKey(token) || (sessionId != null && playersBySession.containsKey(sessionId))) {
                throw new ProtocolException(ErrorCode.ALREADY_IN_QUEUE,
                        "Player or session is already in matchmaking queue");
            }

            QueuedPlayer newPlayer = new QueuedPlayer(
                    guest, preferredTrackId, preferredCarId, sessionId, timeProvider.currentTimeMillis());

            queue.add(newPlayer);
            playersByToken.put(token, newPlayer);
            if (sessionId != null) {
                playersBySession.put(sessionId, newPlayer);
            }

            int count = queue.size();
            log.info("Player {} ({}) entered matchmaking queue (position={}, totalWaiting={})",
                    guest.getDisplayName(), token, count, count);

            if (count >= MAX_PLAYERS) {
                // Rule: Immediate room creation when 8 players reach the queue
                matchToCreate = popMatchedPlayersLocked(MAX_PLAYERS);
            } else if (count >= MIN_PLAYERS) {
                // Rule: Start 15s collection window on reaching 2 players; do NOT reset if already running
                if (collectionDeadlineMs == 0L) {
                    collectionDeadlineMs = timeProvider.currentTimeMillis() + COLLECTION_WINDOW_DURATION_MS;
                    lastBroadcastRemainingSec = (int) (COLLECTION_WINDOW_DURATION_MS / 1000L);
                    log.info("Matchmaking collection window started with {} players. Deadline in {}s.",
                            count, lastBroadcastRemainingSec);
                }
                broadcastStatusLocked();
            } else {
                // 1 player waiting in queue
                sendStatusToPlayerLocked(newPlayer, 1, 1, 0, STATUS_QUEUED);
            }
        }

        // Room creation and player slot joins executed outside queue lock to prevent lock inversion
        if (matchToCreate != null && !matchToCreate.isEmpty()) {
            executeRoomAssignment(matchToCreate);
        }
    }

    /**
     * Cancels queue participation for a waiting player.
     */
    public void cancelQueue(String guestToken) {
        if (guestToken == null) {
            throw new ProtocolException(ErrorCode.NOT_IN_QUEUE, "Invalid guest token");
        }

        synchronized (lock) {
            QueuedPlayer removed = playersByToken.remove(guestToken);
            if (removed == null) {
                throw new ProtocolException(ErrorCode.NOT_IN_QUEUE, "Player is not in matchmaking queue");
            }

            queue.remove(removed);
            if (removed.getSessionId() != null) {
                playersBySession.remove(removed.getSessionId());
                // Send explicit CANCELLED status notification
                MatchmakingStatusPayload cancelledPayload = new MatchmakingStatusPayload(
                        STATUS_CANCELLED, 0, queue.size(), 0, MIN_PLAYERS, MAX_PLAYERS);
                sendEnvelope(removed.getSessionId(), cancelledPayload);
            }

            log.info("Player {} left matchmaking queue (remaining={})", removed.getDisplayName(), queue.size());

            // Rule: If eligible players fall below 2 before race creation, cancel pending start
            if (queue.size() < MIN_PLAYERS && collectionDeadlineMs > 0L) {
                collectionDeadlineMs = 0L;
                lastBroadcastRemainingSec = -1;
                log.info("Queue size dropped below {}. Collection window cancelled.", MIN_PLAYERS);
            }

            broadcastStatusLocked();
        }
    }

    /**
     * Handles connection drop or close for queued sessions.
     */
    public void handleDisconnect(String sessionId, String guestToken) {
        synchronized (lock) {
            QueuedPlayer removed = null;
            if (guestToken != null) {
                removed = playersByToken.remove(guestToken);
            }
            if (removed == null && sessionId != null) {
                removed = playersBySession.remove(sessionId);
                if (removed != null) {
                    playersByToken.remove(removed.getGuestToken());
                }
            }

            if (removed != null) {
                queue.remove(removed);
                if (removed.getSessionId() != null) {
                    playersBySession.remove(removed.getSessionId());
                }

                log.info("Queued player {} removed on disconnect (remaining={})",
                        removed.getDisplayName(), queue.size());

                if (queue.size() < MIN_PLAYERS && collectionDeadlineMs > 0L) {
                    collectionDeadlineMs = 0L;
                    lastBroadcastRemainingSec = -1;
                    log.info("Queue size dropped below {}. Collection window cancelled on disconnect.", MIN_PLAYERS);
                }

                broadcastStatusLocked();
            }
        }
    }

    /**
     * Periodic tick stepping collection window and matching players upon deadline expiration.
     */
    public void tick(long nowMs) {
        List<QueuedPlayer> matchToCreate = null;

        synchronized (lock) {
            if (collectionDeadlineMs > 0L) {
                if (nowMs >= collectionDeadlineMs) {
                    // Collection window has expired
                    if (queue.size() >= MIN_PLAYERS) {
                        int countToMatch = Math.min(MAX_PLAYERS, queue.size());
                        log.info("Collection deadline reached. Matching {} players from queue.", countToMatch);
                        matchToCreate = popMatchedPlayersLocked(countToMatch);
                    } else {
                        // Not enough players remain
                        collectionDeadlineMs = 0L;
                        lastBroadcastRemainingSec = -1;
                        broadcastStatusLocked();
                    }
                } else {
                    // Update remaining time broadcast once per second
                    long diff = collectionDeadlineMs - nowMs;
                    int remainingSec = Math.max(0, (int) Math.ceil(diff / 1000.0));
                    if (remainingSec != lastBroadcastRemainingSec) {
                        lastBroadcastRemainingSec = remainingSec;
                        broadcastStatusLocked();
                    }
                }
            }
        }

        if (matchToCreate != null && !matchToCreate.isEmpty()) {
            executeRoomAssignment(matchToCreate);
        }
    }

    private List<QueuedPlayer> popMatchedPlayersLocked(int countToMatch) {
        List<QueuedPlayer> matched = new ArrayList<>();
        for (int i = 0; i < countToMatch && !queue.isEmpty(); i++) {
            QueuedPlayer p = queue.remove(0);
            playersByToken.remove(p.getGuestToken());
            if (p.getSessionId() != null) {
                playersBySession.remove(p.getSessionId());
            }
            matched.add(p);
        }

        // Manage collection window for remaining queued racers
        if (queue.size() >= MIN_PLAYERS) {
            collectionDeadlineMs = timeProvider.currentTimeMillis() + COLLECTION_WINDOW_DURATION_MS;
            lastBroadcastRemainingSec = (int) (COLLECTION_WINDOW_DURATION_MS / 1000L);
        } else {
            collectionDeadlineMs = 0L;
            lastBroadcastRemainingSec = -1;
        }

        broadcastStatusLocked();
        return matched;
    }

    private void executeRoomAssignment(List<QueuedPlayer> matched) {
        if (matched == null || matched.isEmpty()) return;

        // FIFO priority: First matched player's preferred track defines the room circuit
        String trackId = matched.get(0).getPreferredTrackId();
        if (trackId == null || trackId.isBlank()) {
            trackId = "coastal-rush";
        }

        Room room = roomManager.createRoom(trackId);
        log.info("Allocated new authoritative Room {} on track {} for {} matched racers",
                room.getRoomId(), trackId, matched.size());

        for (QueuedPlayer p : matched) {
            try {
                roomManager.joinRoom(room.getRoomId(), p.getGuestSession(), p.getPreferredCarId(), p.getSessionId());
            } catch (Exception e) {
                log.error("Failed to join matched player {} to room {}: {}",
                        p.getDisplayName(), room.getRoomId(), e.getMessage(), e);
            }
        }
    }

    private void broadcastStatusLocked() {
        int total = queue.size();
        int remainingSec = 0;
        String status = STATUS_QUEUED;

        if (collectionDeadlineMs > 0L) {
            long diff = collectionDeadlineMs - timeProvider.currentTimeMillis();
            remainingSec = Math.max(0, (int) Math.ceil(diff / 1000.0));
            status = STATUS_COLLECTION_WINDOW;
        }

        for (int i = 0; i < total; i++) {
            QueuedPlayer p = queue.get(i);
            int position = i + 1;
            sendStatusToPlayerLocked(p, position, total, remainingSec, status);
        }
    }

    private void sendStatusToPlayerLocked(QueuedPlayer p, int position, int total, int remainingSec, String status) {
        if (p.getSessionId() != null) {
            MatchmakingStatusPayload payload = new MatchmakingStatusPayload(
                    status, position, total, remainingSec, MIN_PLAYERS, MAX_PLAYERS);
            sendEnvelope(p.getSessionId(), payload);
        }
    }

    private void sendEnvelope(String sessionId, MatchmakingStatusPayload payload) {
        if (sessionId != null) {
            MessageEnvelope<MatchmakingStatusPayload> envelope =
                    MessageEnvelope.of(MessageType.MATCHMAKING_STATUS, payload);
            broadcaster.sendToSession(sessionId, envelope);
        }
    }

    public boolean isQueued(String guestToken) {
        if (guestToken == null) return false;
        synchronized (lock) {
            return playersByToken.containsKey(guestToken);
        }
    }

    public boolean isSessionQueued(String sessionId) {
        if (sessionId == null) return false;
        synchronized (lock) {
            return playersBySession.containsKey(sessionId);
        }
    }

    public int getQueueSize() {
        synchronized (lock) {
            return queue.size();
        }
    }

    public long getCollectionDeadlineMs() {
        synchronized (lock) {
            return collectionDeadlineMs;
        }
    }

    public void clear() {
        synchronized (lock) {
            queue.clear();
            playersByToken.clear();
            playersBySession.clear();
            collectionDeadlineMs = 0L;
            lastBroadcastRemainingSec = -1;
        }
    }

    /**
     * Immutable value object representing a player waiting in the matchmaking queue.
     */
    public static class QueuedPlayer {
        private final GuestSession guestSession;
        private final String preferredTrackId;
        private final String preferredCarId;
        private final String sessionId;
        private final long joinedAtMs;

        public QueuedPlayer(GuestSession guestSession, String preferredTrackId, String preferredCarId,
                            String sessionId, long joinedAtMs) {
            this.guestSession = guestSession;
            this.preferredTrackId = preferredTrackId;
            this.preferredCarId = preferredCarId;
            this.sessionId = sessionId;
            this.joinedAtMs = joinedAtMs;
        }

        public GuestSession getGuestSession() { return guestSession; }
        public String getGuestToken() { return guestSession.getGuestToken(); }
        public String getDisplayName() { return guestSession.getDisplayName(); }
        public String getPreferredTrackId() { return preferredTrackId; }
        public String getPreferredCarId() { return preferredCarId; }
        public String getSessionId() { return sessionId; }
        public long getJoinedAtMs() { return joinedAtMs; }
    }
}

