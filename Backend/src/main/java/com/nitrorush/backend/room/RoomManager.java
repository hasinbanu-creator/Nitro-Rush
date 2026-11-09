package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.payload.PlayerInputPayload;
import com.nitrorush.backend.session.GuestSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Thread-safe lifecycle manager for active game rooms.
 * Provides atomic room allocation, session routing, and isolated simulation ticks.
 */
@Service
public class RoomManager {

    private static final Logger log = LoggerFactory.getLogger(RoomManager.class);

    private final TrackRegistry trackRegistry;
    private final TimeProvider timeProvider;
    private final MessageBroadcaster broadcaster;

    private final ConcurrentMap<String, Room> activeRooms = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> guestTokenToRoomId = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> sessionIdToRoomId = new ConcurrentHashMap<>();

    private final AtomicLong roomCounter = new AtomicLong(100);

    public RoomManager(TrackRegistry trackRegistry, TimeProvider timeProvider, MessageBroadcaster broadcaster) {
        this.trackRegistry = trackRegistry;
        this.timeProvider = timeProvider;
        this.broadcaster = broadcaster;
    }

    /**
     * Creates a new game room for the specified circuit.
     */
    public Room createRoom(String trackId) {
        String effectiveTrackId = (trackId != null && !trackId.isBlank()) ? trackId.trim() : "coastal-rush";
        TrackDefinition trackDef = trackRegistry.getTrack(effectiveTrackId);
        if (trackDef == null) {
            trackDef = trackRegistry.getTrack("coastal-rush");
        }

        String roomId = "room-" + roomCounter.incrementAndGet();
        Room room = new Room(roomId, trackDef, timeProvider, broadcaster);
        activeRooms.put(roomId, room);
        log.info("Created new multiplayer room {} on track {}", roomId, trackDef.getId());
        return room;
    }

    /**
     * Retrieves or creates a room by ID and track.
     */
    public Room getOrCreateRoom(String roomId, String trackId) {
        if (roomId == null || roomId.isBlank()) {
            return createRoom(trackId);
        }
        return activeRooms.computeIfAbsent(roomId, id -> {
            TrackDefinition trackDef = trackRegistry.getTrack(trackId != null ? trackId : "coastal-rush");
            return new Room(id, trackDef, timeProvider, broadcaster);
        });
    }

    public Optional<Room> getRoom(String roomId) {
        if (roomId == null) return Optional.empty();
        return Optional.ofNullable(activeRooms.get(roomId));
    }

    public Optional<Room> findRoomByGuestToken(String guestToken) {
        if (guestToken == null) return Optional.empty();
        String roomId = guestTokenToRoomId.get(guestToken);
        if (roomId == null) return Optional.empty();
        return getRoom(roomId);
    }

    public Optional<Room> findRoomBySessionId(String sessionId) {
        if (sessionId == null) return Optional.empty();
        String roomId = sessionIdToRoomId.get(sessionId);
        if (roomId == null) return Optional.empty();
        return getRoom(roomId);
    }

    /**
     * Joins a guest player into a room.
     */
    public PlayerSlot joinRoom(String roomId, GuestSession guest, String preferredCarId, String sessionId) {
        Objects.requireNonNull(guest, "guest must not be null");
        Room room = getRoom(roomId).orElseThrow(() ->
                new ProtocolException(ErrorCode.ROOM_NOT_FOUND, "Room not found: " + roomId));

        PlayerSlot slot = room.join(guest, preferredCarId, sessionId);
        guestTokenToRoomId.put(guest.getGuestToken(), room.getRoomId());
        if (sessionId != null) {
            sessionIdToRoomId.put(sessionId, room.getRoomId());
        }
        return slot;
    }

    /**
     * Leaves the currently assigned room.
     */
    public boolean leaveRoom(String guestToken) {
        if (guestToken == null) return false;
        String roomId = guestTokenToRoomId.remove(guestToken);
        if (roomId != null) {
            Room room = activeRooms.get(roomId);
            if (room != null) {
                return room.leave(guestToken);
            }
        }
        return false;
    }

    /**
     * Selects vehicle inside room.
     */
    public void selectCar(String guestToken, String roomId, String carId) {
        Room room = resolveRoom(guestToken, roomId);
        room.selectCar(guestToken, carId);
    }

    /**
     * Sets ready status inside room.
     */
    public void setReady(String guestToken, String roomId, boolean isReady) {
        Room room = resolveRoom(guestToken, roomId);
        room.setReady(guestToken, isReady);
    }

    /**
     * Submits player input inside active race room.
     */
    public void submitInput(String guestToken, PlayerInputPayload payload) {
        if (payload == null) return;
        Room room = resolveRoom(guestToken, payload.getRoomId());
        room.handleInput(guestToken, payload);
    }

    /**
     * Handles connection disconnect for a session and/or guest token.
     */
    public void handleDisconnect(String sessionId, String guestToken) {
        if (sessionId != null) {
            sessionIdToRoomId.remove(sessionId);
        }

        if (guestToken != null) {
            String roomId = guestTokenToRoomId.get(guestToken);
            if (roomId != null) {
                Room room = activeRooms.get(roomId);
                if (room != null) {
                    room.handleDisconnect(guestToken);
                    if (room.getState() == RoomState.CLOSED) {
                        guestTokenToRoomId.remove(guestToken);
                    }
                }
            }
        }
    }

    /**
     * Reconnects a player into an active race room.
     */
    public boolean handleReconnect(String roomId, String guestToken, String newSessionId, long lastKnownTick) {
        Room room = getRoom(roomId).orElseThrow(() ->
                new ProtocolException(ErrorCode.ROOM_NOT_FOUND, "Room not found: " + roomId));

        boolean ok = room.handleReconnect(guestToken, newSessionId, lastKnownTick);
        if (ok) {
            guestTokenToRoomId.put(guestToken, roomId);
            if (newSessionId != null) {
                sessionIdToRoomId.put(newSessionId, roomId);
            }
        }
        return ok;
    }

    private Room resolveRoom(String guestToken, String explicitRoomId) {
        if (explicitRoomId != null && !explicitRoomId.isBlank()) {
            return getRoom(explicitRoomId).orElseThrow(() ->
                    new ProtocolException(ErrorCode.ROOM_NOT_FOUND, "Room not found: " + explicitRoomId));
        }
        return findRoomByGuestToken(guestToken).orElseThrow(() ->
                new ProtocolException(ErrorCode.ROOM_NOT_FOUND, "Player is not currently in any room"));
    }

    /**
     * Periodic tick stepping all active rooms safely.
     * Prevents an exception in one room from crashing other rooms.
     */
    public void tick(double elapsedSeconds) {
        long now = timeProvider.currentTimeMillis();

        for (Room room : activeRooms.values()) {
            try {
                room.update(now);
                if (room.getState() == RoomState.RACING) {
                    room.stepSimulation(elapsedSeconds);
                }
            } catch (Exception e) {
                log.error("Error executing simulation tick for room {}: {}", room.getRoomId(), e.getMessage(), e);
            }
        }

        cleanupClosedRooms();
    }

    /**
     * Safe cleanup of CLOSED rooms only. Active races are never removed.
     */
    public void cleanupClosedRooms() {
        for (Map.Entry<String, Room> entry : activeRooms.entrySet()) {
            Room room = entry.getValue();
            if (room.getState() == RoomState.CLOSED) {
                activeRooms.remove(entry.getKey(), room);
                log.info("Cleaned up closed room {}", room.getRoomId());
            }
        }
    }

    public int getActiveRoomCount() {
        return activeRooms.size();
    }

    public Collection<Room> getAllRooms() {
        return Collections.unmodifiableCollection(activeRooms.values());
    }
}

