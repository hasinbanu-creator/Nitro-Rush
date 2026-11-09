package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.physics.config.PhysicsConstants;
import com.nitrorush.backend.physics.config.VehicleConfig;
import com.nitrorush.backend.physics.config.VehicleRegistry;
import com.nitrorush.backend.physics.engine.FixedTimestepRunner;
import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.simulation.RaceSimulationWorld;
import com.nitrorush.backend.physics.track.GridSlot;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.*;
import com.nitrorush.backend.race.CompetitorProgress;
import com.nitrorush.backend.race.RaceProgressTracker;
import com.nitrorush.backend.session.GuestSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Thread-safe multiplayer room lifecycle orchestrator and authoritative race simulation.
 */
public class Room {

    private static final Logger log = LoggerFactory.getLogger(Room.class);

    public static final int MAX_PLAYERS = 8;
    public static final int MIN_PLAYERS_TO_START = 2;
    public static final int TOTAL_LAPS = 3;

    public static final long LOBBY_TIMEOUT_MS = 30_000L;
    public static final long READY_COLLECTION_WINDOW_MS = 15_000L;
    public static final long COUNTDOWN_DURATION_MS = 3_000L;
    public static final long RECONNECT_GRACE_MS = 15_000L;
    public static final long POST_RACE_DISPLAY_MS = 20_000L;

    private static final Set<String> VALID_CAR_IDS = Set.of("bolt-gt", "viper-r", "rally-apex", "titan-v8");

    private final String roomId;
    private final TrackDefinition track;
    private final TimeProvider timeProvider;
    private final MessageBroadcaster broadcaster;

    private volatile RoomState state = RoomState.WAITING;
    private final long createdAtMs;

    private final List<PlayerSlot> playerSlots = new CopyOnWriteArrayList<>();
    private final Map<String, PlayerSlot> playersByToken = new ConcurrentHashMap<>();
    private final Map<String, PlayerSlot> playersById = new ConcurrentHashMap<>();

    private volatile long readyCountdownStartedAtMs = 0;
    private volatile long countdownStartedAtMs = 0;
    private volatile long raceStartedAtMs = 0;
    private volatile long finishedAtMs = 0;

    private final RaceSimulationWorld simulationWorld;
    private final FixedTimestepRunner fixedTimestepRunner;
    private final RaceProgressTracker progressTracker;

    private final Object stateLock = new Object();

    public Room(String roomId, TrackDefinition track, TimeProvider timeProvider, MessageBroadcaster broadcaster) {
        this.roomId = Objects.requireNonNull(roomId, "roomId must not be null");
        this.track = Objects.requireNonNull(track, "track must not be null");
        this.timeProvider = Objects.requireNonNull(timeProvider, "timeProvider must not be null");
        this.broadcaster = broadcaster != null ? broadcaster : new NoopMessageBroadcaster();

        this.createdAtMs = timeProvider.currentTimeMillis();
        this.simulationWorld = new RaceSimulationWorld(track, "MEDIUM");
        this.fixedTimestepRunner = new FixedTimestepRunner();
        this.progressTracker = new RaceProgressTracker(track, TOTAL_LAPS);

        // Configure race completion listener
        this.progressTracker.setOnRaceComplete(this::onRaceCompleted);
        this.progressTracker.setOnCompetitorFinished((comp, pos) -> {
            PlayerSlot slot = playersById.get(comp.getPlayerId());
            if (slot != null && slot.isConnected() && slot.getSessionId() != null) {
                RaceFinishedPayload payload = new RaceFinishedPayload(
                        comp.getPlayerId(),
                        pos,
                        comp.getFinishTimeMs(),
                        comp.getBestLapTimeMs(),
                        comp.getLapTimesMs()
                );
                this.broadcaster.sendToSession(slot.getSessionId(),
                        MessageEnvelope.of(MessageType.RACE_FINISHED, payload));
            }
        });
    }

    public String getRoomId() { return roomId; }
    public TrackDefinition getTrack() { return track; }
    public RoomState getState() { return state; }
    public long getReadyCountdownStartedAtMs() { return readyCountdownStartedAtMs; }
    public int getPlayerCount() { return playerSlots.size(); }
    public List<PlayerSlot> getPlayerSlots() { return Collections.unmodifiableList(playerSlots); }

    // ==========================================
    // Player Join / Leave / Lobby Operations
    // ==========================================

    public PlayerSlot join(GuestSession guest, String preferredCarId, String sessionId) {
        Objects.requireNonNull(guest, "guest session must not be null");
        String guestToken = guest.getGuestToken();

        synchronized (stateLock) {
            if (state != RoomState.WAITING) {
                throw new ProtocolException(ErrorCode.ROOM_STATE_INVALID,
                        "Cannot join room " + roomId + " in state " + state);
            }

            // Check if player is already in this room
            PlayerSlot existing = playersByToken.get(guestToken);
            if (existing != null) {
                existing.setSessionId(sessionId);
                existing.setConnected(true);
                existing.setDisconnectedAt(0);
                existing.setReconnectDeadlineMs(0);
                log.info("Player {} re-joined lobby slot {} in room {}", guest.getDisplayName(), existing.getSlotId(), roomId);
                return existing;
            }

            if (playerSlots.size() >= MAX_PLAYERS) {
                throw new ProtocolException(ErrorCode.ROOM_FULL, "Room " + roomId + " is full (max 8 players)");
            }

            int slotIndex = playerSlots.size();
            String slotId = "P" + (slotIndex + 1);
            String playerId = "p" + (slotIndex + 1);

            String selectedCar = (preferredCarId != null && VALID_CAR_IDS.contains(preferredCarId.trim().toLowerCase()))
                    ? preferredCarId.trim().toLowerCase()
                    : "bolt-gt";

            PlayerSlot newSlot = new PlayerSlot(
                    playerId, guestToken, guest.getDisplayName(), slotId, slotIndex, selectedCar, sessionId);

            playerSlots.add(newSlot);
            playersByToken.put(guestToken, newSlot);
            playersById.put(playerId, newSlot);

            log.info("Player {} joined room {} as {} (car: {})", guest.getDisplayName(), roomId, slotId, selectedCar);

            // 1. Send ROOM_ASSIGNED directly to joining player
            List<PlayerSlotInfo> playerInfos = new ArrayList<>();
            for (PlayerSlot slot : playerSlots) {
                playerInfos.add(slot.toSlotInfo());
            }
            RoomAssignedPayload assignedPayload = new RoomAssignedPayload(
                    roomId, track.getId(), slotId, TOTAL_LAPS, playerInfos);
            if (sessionId != null) {
                broadcaster.sendToSession(sessionId, MessageEnvelope.of(MessageType.ROOM_ASSIGNED, assignedPayload));
            }

            // 2. Broadcast PLAYER_JOINED to existing other members
            PlayerJoinedPayload joinedPayload = new PlayerJoinedPayload(newSlot.toSlotInfo());
            for (PlayerSlot other : playerSlots) {
                if (!other.getGuestToken().equals(guestToken) && other.isConnected() && other.getSessionId() != null) {
                    broadcaster.sendToSession(other.getSessionId(),
                            MessageEnvelope.of(MessageType.PLAYER_JOINED, joinedPayload));
                }
            }

            // Check if immediate start condition reached (8 players joined)
            checkLobbyTransitions(timeProvider.currentTimeMillis());

            return newSlot;
        }
    }

    public boolean leave(String guestToken) {
        if (guestToken == null) return false;

        synchronized (stateLock) {
            PlayerSlot slot = playersByToken.remove(guestToken);
            if (slot == null) {
                return false;
            }

            playerSlots.remove(slot);
            playersById.remove(slot.getPlayerId());

            log.info("Player {} ({}) left room {}", slot.getDisplayName(), slot.getSlotId(), roomId);

            // Broadcast PLAYER_LEFT to remaining members
            PlayerLeftPayload leftPayload = new PlayerLeftPayload(slot.getPlayerId(), slot.getSlotId());
            for (PlayerSlot remaining : playerSlots) {
                if (remaining.isConnected() && remaining.getSessionId() != null) {
                    broadcaster.sendToSession(remaining.getSessionId(),
                            MessageEnvelope.of(MessageType.PLAYER_LEFT, leftPayload));
                }
            }

            if (playerSlots.isEmpty()) {
                state = RoomState.CLOSED;
                log.info("Room {} is now CLOSED (all players left)", roomId);
            } else if (state == RoomState.WAITING) {
                checkLobbyTransitions(timeProvider.currentTimeMillis());
            }

            return true;
        }
    }

    public void selectCar(String guestToken, String carId) {
        synchronized (stateLock) {
            if (state != RoomState.WAITING) {
                throw new ProtocolException(ErrorCode.ROOM_NOT_IN_LOBBY, "Cannot change car outside WAITING state");
            }

            PlayerSlot slot = playersByToken.get(guestToken);
            if (slot == null) {
                throw new ProtocolException(ErrorCode.NOT_IN_QUEUE, "Player not found in room " + roomId);
            }

            if (carId == null || !VALID_CAR_IDS.contains(carId.trim().toLowerCase())) {
                throw new ProtocolException(ErrorCode.INVALID_CAR_ID, "Invalid vehicle ID: " + carId);
            }

            slot.setCarId(carId.trim().toLowerCase());

            // Broadcast status update
            broadcastPlayerReadyStatus(slot);
        }
    }

    public void setReady(String guestToken, boolean isReady) {
        synchronized (stateLock) {
            if (state != RoomState.WAITING) {
                throw new ProtocolException(ErrorCode.ROOM_STATE_INVALID, "Cannot toggle ready outside WAITING state");
            }

            PlayerSlot slot = playersByToken.get(guestToken);
            if (slot == null) {
                throw new ProtocolException(ErrorCode.NOT_IN_QUEUE, "Player not found in room " + roomId);
            }

            slot.setReady(isReady);
            log.info("Player {} in room {} ready={}", slot.getDisplayName(), roomId, isReady);

            broadcastPlayerReadyStatus(slot);
            checkLobbyTransitions(timeProvider.currentTimeMillis());
        }
    }

    private void broadcastPlayerReadyStatus(PlayerSlot slot) {
        PlayerReadyStatusPayload payload = new PlayerReadyStatusPayload(
                slot.getPlayerId(), slot.isReady(), slot.getCarId());
        MessageEnvelope<PlayerReadyStatusPayload> envelope =
                MessageEnvelope.of(MessageType.PLAYER_READY_STATUS, payload);

        for (PlayerSlot member : playerSlots) {
            if (member.isConnected() && member.getSessionId() != null) {
                broadcaster.sendToSession(member.getSessionId(), envelope);
            }
        }
    }

    // ==========================================
    // State Transitions
    // ==========================================

    private void checkLobbyTransitions(long nowMs) {
        if (state != RoomState.WAITING) {
            return;
        }

        int total = playerSlots.size();
        int readyCount = 0;
        for (PlayerSlot slot : playerSlots) {
            if (slot.isReady()) {
                readyCount++;
            }
        }

        // Rule 1: Immediate start exclusively when 8 players are present and all 8 are ready
        if (total == MAX_PLAYERS && readyCount == MAX_PLAYERS) {
            startCountdown(nowMs);
            return;
        }

        // Rule 2: At least 2 ready players starts 15-second collection window
        if (readyCount >= MIN_PLAYERS_TO_START) {
            if (readyCountdownStartedAtMs == 0) {
                readyCountdownStartedAtMs = nowMs;
                log.info("Room {}: {}/{} ready. Started 15s collection countdown.", roomId, readyCount, total);
            }
        } else {
            // Drop below 2 ready players cancels the 15-second collection countdown
            if (readyCountdownStartedAtMs != 0) {
                readyCountdownStartedAtMs = 0;
                log.info("Room {}: Ready count dropped below 2. Reset collection countdown.", roomId);
            }
        }
    }

    public void startCountdown(long nowMs) {
        synchronized (stateLock) {
            if (state != RoomState.WAITING) {
                return;
            }

            int readyCount = 0;
            for (PlayerSlot slot : playerSlots) {
                if (slot.isReady()) readyCount++;
            }
            if (playerSlots.size() < MIN_PLAYERS_TO_START) {
                log.warn("Room {}: Cannot start countdown with fewer than {} players", roomId, MIN_PLAYERS_TO_START);
                return;
            }

            state = RoomState.COUNTDOWN;
            countdownStartedAtMs = nowMs;
            log.info("Room {} transitioned to COUNTDOWN. Setting up 8-slot grid.", roomId);

            // 1. Setup Staggered Starting Grid
            List<GridSlot> grid = MultiplayerGridConfig.generateGrid(track);
            for (int i = 0; i < playerSlots.size(); i++) {
                PlayerSlot slot = playerSlots.get(i);
                GridSlot gridPos = grid.get(i);

                VehicleConfig config = VehicleRegistry.getStatic(slot.getCarId());
                VehicleState initialState = new VehicleState(
                        gridPos.getX(), gridPos.getY(), gridPos.getAngle(), 100.0);

                simulationWorld.addVehicle(slot.getPlayerId(), config, initialState);
                simulationWorld.getVehicleSlot(slot.getPlayerId()).setControlsLocked(true);

                progressTracker.registerCompetitor(
                        slot.getPlayerId(), slot.getDisplayName(), slot.getSlotId(), slot.getCarId());
            }

            // 2. Broadcast COUNTDOWN_STARTED (duration 3 seconds)
            CountdownStartedPayload payload = new CountdownStartedPayload(3);
            MessageEnvelope<CountdownStartedPayload> envelope =
                    MessageEnvelope.of(MessageType.COUNTDOWN_STARTED, payload);

            for (PlayerSlot slot : playerSlots) {
                if (slot.isConnected() && slot.getSessionId() != null) {
                    broadcaster.sendToSession(slot.getSessionId(), envelope);
                }
            }
        }
    }

    private void startRace(long nowMs) {
        synchronized (stateLock) {
            if (state != RoomState.COUNTDOWN) {
                return;
            }

            state = RoomState.RACING;
            raceStartedAtMs = nowMs;
            fixedTimestepRunner.reset();
            progressTracker.startRace();

            // Unlock controls for all vehicles
            for (PlayerSlot slot : playerSlots) {
                var vSlot = simulationWorld.getVehicleSlot(slot.getPlayerId());
                if (vSlot != null) {
                    vSlot.setControlsLocked(false);
                }
            }

            log.info("Room {} transitioned to RACING! Controls unlocked.", roomId);

            // Broadcast RACE_STARTED
            RaceStartedPayload payload = new RaceStartedPayload(nowMs);
            MessageEnvelope<RaceStartedPayload> envelope = MessageEnvelope.of(MessageType.RACE_STARTED, payload);

            for (PlayerSlot slot : playerSlots) {
                if (slot.isConnected() && slot.getSessionId() != null) {
                    broadcaster.sendToSession(slot.getSessionId(), envelope);
                }
            }
        }
    }

    private void onRaceCompleted() {
        synchronized (stateLock) {
            if (state != RoomState.RACING) {
                return;
            }

            state = RoomState.FINISHED;
            finishedAtMs = timeProvider.currentTimeMillis();
            log.info("Room {} transitioned to FINISHED! Final results generated.", roomId);

            RaceResultsPayload results = progressTracker.generateResults();
            MessageEnvelope<RaceResultsPayload> envelope = MessageEnvelope.of(MessageType.RACE_RESULTS, results);

            for (PlayerSlot slot : playerSlots) {
                if (slot.isConnected() && slot.getSessionId() != null) {
                    broadcaster.sendToSession(slot.getSessionId(), envelope);
                }
            }
        }
    }

    // ==========================================
    // Simulation Tick & Time Update
    // ==========================================

    /**
     * Periodic room update driven by TimeProvider.
     * Can be invoked by scheduler or test clock.
     */
    public void update(long nowMs) {
        synchronized (stateLock) {
            switch (state) {
                case WAITING -> {
                    // Check 15s collection timer
                    if (readyCountdownStartedAtMs > 0 && (nowMs - readyCountdownStartedAtMs >= READY_COLLECTION_WINDOW_MS)) {
                        int readyCount = 0;
                        for (PlayerSlot slot : playerSlots) {
                            if (slot.isReady()) readyCount++;
                        }
                        if (readyCount >= MIN_PLAYERS_TO_START) {
                            log.info("Room {}: 15s collection window elapsed with {} ready. Starting race.", roomId, readyCount);
                            startCountdown(nowMs);
                            return;
                        }
                    }

                    // Check 30s lobby timeout
                    if (nowMs - createdAtMs >= LOBBY_TIMEOUT_MS) {
                        int readyCount = 0;
                        for (PlayerSlot slot : playerSlots) {
                            if (slot.isReady()) readyCount++;
                        }
                        if (readyCount >= MIN_PLAYERS_TO_START) {
                            log.info("Room {}: 30s lobby timeout expired with {} ready. Starting race.", roomId, readyCount);
                            startCountdown(nowMs);
                        } else if (playerSlots.isEmpty()) {
                            state = RoomState.CLOSED;
                        }
                    }
                }
                case COUNTDOWN -> {
                    if (nowMs - countdownStartedAtMs >= COUNTDOWN_DURATION_MS) {
                        startRace(nowMs);
                    }
                }
                case RACING -> {
                    // 1. Process disconnected player timeout (15s grace)
                    for (PlayerSlot slot : playerSlots) {
                        if (!slot.isConnected() && slot.getReconnectDeadlineMs() > 0 && nowMs > slot.getReconnectDeadlineMs()) {
                            slot.setReconnectExpired(true);
                            slot.setReconnectDeadlineMs(0);
                            log.warn("Room {}: Player {} reconnect window (15s) expired. Marked DNF.", roomId, slot.getDisplayName());
                            var comp = progressTracker.getCompetitor(slot.getPlayerId());
                            if (comp != null && !comp.isFinished()) {
                                comp.setFinished(true);
                                comp.setStatus("DNF");
                            }
                        }
                    }

                    // 2. Fixed Timestep Physics Simulation
                    // When invoked periodically with real or simulated time, we calculate elapsed time.
                    // For manual test control, advanceTicks can be called directly.
                }
                case FINISHED -> {
                    if (nowMs - finishedAtMs >= POST_RACE_DISPLAY_MS) {
                        state = RoomState.CLOSED;
                        log.info("Room {} post-race display window elapsed. Transitioned to CLOSED.", roomId);
                    }
                }
                case CLOSED -> {
                    // No-op
                }
            }
        }
    }

    /**
     * Executes one or more authoritative 50ms simulation ticks.
     *
     * @param elapsedSeconds Time interval to simulate in seconds
     * @return Number of 50ms ticks executed
     */
    public int stepSimulation(double elapsedSeconds) {
        synchronized (stateLock) {
            if (state != RoomState.RACING) {
                return 0;
            }

            return fixedTimestepRunner.advance(elapsedSeconds, (currentTick, dt) -> {
                executeSimulationTick(currentTick, dt);
            });
        }
    }

    /**
     * Directly executes one discrete 50ms physics tick (used in tests or runner).
     */
    public void executeSimulationTick(long currentTick, double dt) {
        // 1. Synchronize player inputs to simulation slots
        for (PlayerSlot slot : playerSlots) {
            PlayerInput input = slot.isConnected() ? slot.getLatestInput() : PlayerInput.neutral();
            simulationWorld.updateInput(slot.getPlayerId(), input);
        }

        // 2. Advance physics world (individual vehicle dynamics + 2-pass collisions)
        simulationWorld.step(dt);

        // 3. Update race checkpoints, laps, and live scoring
        Map<String, VehicleState> snapshot = simulationWorld.getSnapshot();
        progressTracker.update(dt, snapshot);

        // 4. Construct and broadcast 20 Hz RACE_STATE snapshot
        long serverTimeMs = Math.round(fixedTimestepRunner.getTotalSimulatedTime() * 1000.0);
        MessageEnvelope<RaceStatePayload> snapshotEnvelope = buildSnapshot(currentTick, serverTimeMs, snapshot);

        for (PlayerSlot slot : playerSlots) {
            if (slot.isConnected() && slot.getSessionId() != null) {
                broadcaster.sendToSession(slot.getSessionId(), snapshotEnvelope);
            }
        }
    }

    public MessageEnvelope<RaceStatePayload> buildSnapshot(long serverTick, long serverTimeMs, Map<String, VehicleState> snapshot) {
        Map<String, Long> ackInputSeq = new LinkedHashMap<>();
        List<VehicleTelemetry> telemetryList = new ArrayList<>();

        List<CompetitorProgress> leaderboard = progressTracker.getLeaderboard();
        Map<String, Integer> positionMap = new HashMap<>();
        for (int i = 0; i < leaderboard.size(); i++) {
            positionMap.put(leaderboard.get(i).getPlayerId(), i + 1);
        }

        for (PlayerSlot slot : playerSlots) {
            ackInputSeq.put(slot.getPlayerId(), slot.getLastAckInputSeq());

            VehicleState vState = snapshot.get(slot.getPlayerId());
            CompetitorProgress comp = progressTracker.getCompetitor(slot.getPlayerId());

            if (vState != null && comp != null) {
                int pos = positionMap.getOrDefault(slot.getPlayerId(), 1);
                String status = comp.getStatus();
                if (!slot.isConnected() && !comp.isFinished()) {
                    status = "DISCONNECTED";
                }

                telemetryList.add(new VehicleTelemetry(
                        slot.getPlayerId(),
                        vState.getX(),
                        vState.getY(),
                        vState.getVx(),
                        vState.getVy(),
                        vState.getRotation(),
                        (int) Math.round(vState.getForwardSpeed() * 0.40), // speed in km/h
                        comp.getCurrentLap(),
                        comp.getNextCheckpointIndex(),
                        (int) Math.round(vState.getNitroAmount()),
                        vState.isDrifting(),
                        pos,
                        status
                ));
            }
        }

        return MessageEnvelope.of(MessageType.RACE_STATE,
                new RaceStatePayload(serverTick, serverTimeMs, ackInputSeq, telemetryList));
    }

    // ==========================================
    // Client Input Handling
    // ==========================================

    public void handleInput(String guestToken, PlayerInputPayload payload) {
        if (payload == null) return;

        synchronized (stateLock) {
            if (state != RoomState.RACING) {
                return; // drop silently if not in RACING state
            }

            PlayerSlot slot = playersByToken.get(guestToken);
            if (slot == null) {
                return; // not a member of this room
            }

            // Input Validation and Clamping
            double throttle = Math.max(0.0, Math.min(1.0, payload.getThrottle()));
            double brake = Math.max(0.0, Math.min(1.0, payload.getBrake()));
            double steer = Math.max(-1.0, Math.min(1.0, payload.getSteer()));
            boolean drift = payload.isDrift();
            boolean nitro = payload.isNitro();

            long seq = payload.getSequenceNumber();
            if (seq > slot.getLastAckInputSeq()) {
                slot.setLastAckInputSeq(seq);
            }

            PlayerInput sanitized = new PlayerInput(throttle, brake, steer, drift, nitro);
            slot.setLatestInput(sanitized);
        }
    }

    // ==========================================
    // Disconnect & 15-Second Reconnect Lifecycle
    // ==========================================

    public void handleDisconnect(String guestToken) {
        if (guestToken == null) return;

        synchronized (stateLock) {
            PlayerSlot slot = playersByToken.get(guestToken);
            if (slot == null) return;

            long now = timeProvider.currentTimeMillis();

            if (state == RoomState.WAITING) {
                leave(guestToken);
            } else if (state == RoomState.COUNTDOWN || state == RoomState.RACING) {
                slot.setConnected(false);
                slot.setDisconnectedAt(now);
                slot.setReconnectDeadlineMs(now + RECONNECT_GRACE_MS);
                slot.setLatestInput(PlayerInput.neutral());
                slot.setSessionId(null);

                log.warn("Room {}: Player {} ({}) disconnected. Started 15s reconnection grace.",
                        roomId, slot.getDisplayName(), slot.getPlayerId());

                // Broadcast PLAYER_DISCONNECTED to remaining racers
                PlayerDisconnectedPayload payload = new PlayerDisconnectedPayload(slot.getPlayerId(), 15);
                MessageEnvelope<PlayerDisconnectedPayload> envelope =
                        MessageEnvelope.of(MessageType.PLAYER_DISCONNECTED, payload);

                for (PlayerSlot other : playerSlots) {
                    if (other.isConnected() && other.getSessionId() != null) {
                        broadcaster.sendToSession(other.getSessionId(), envelope);
                    }
                }
            }
        }
    }

    public boolean handleReconnect(String guestToken, String newSessionId, long lastKnownTick) {
        synchronized (stateLock) {
            PlayerSlot slot = playersByToken.get(guestToken);
            if (slot == null) {
                throw new ProtocolException(ErrorCode.INVALID_RECONNECT_TOKEN, "Player not found in room " + roomId);
            }

            if (state == RoomState.CLOSED) {
                throw new ProtocolException(ErrorCode.ROOM_ALREADY_CLOSED, "Room " + roomId + " is already closed");
            }

            long now = timeProvider.currentTimeMillis();
            if (slot.isReconnectExpired() || (slot.getReconnectDeadlineMs() > 0 && now > slot.getReconnectDeadlineMs())) {
                throw new ProtocolException(ErrorCode.SESSION_EXPIRED, "Reconnection window (15s) has expired");
            }

            // Restore connection
            slot.setConnected(true);
            slot.setSessionId(newSessionId);
            slot.setDisconnectedAt(0);
            slot.setReconnectDeadlineMs(0);

            log.info("Room {}: Player {} ({}) successfully reconnected!", roomId, slot.getDisplayName(), slot.getPlayerId());

            // 1. Send immediate full state resynchronization snapshot to reconnecting player
            Map<String, VehicleState> snapshot = simulationWorld.getSnapshot();
            long serverTick = simulationWorld.getTick();
            long serverTimeMs = Math.round(fixedTimestepRunner.getTotalSimulatedTime() * 1000.0);
            MessageEnvelope<RaceStatePayload> resyncSnapshot = buildSnapshot(serverTick, serverTimeMs, snapshot);
            broadcaster.sendToSession(newSessionId, resyncSnapshot);

            // 2. Broadcast PLAYER_RECONNECTED to all members
            PlayerReconnectedPayload reconnectedPayload = new PlayerReconnectedPayload(slot.getPlayerId());
            MessageEnvelope<PlayerReconnectedPayload> envelope =
                    MessageEnvelope.of(MessageType.PLAYER_RECONNECTED, reconnectedPayload);

            for (PlayerSlot member : playerSlots) {
                if (member.isConnected() && member.getSessionId() != null) {
                    broadcaster.sendToSession(member.getSessionId(), envelope);
                }
            }

            return true;
        }
    }

    public RaceSimulationWorld getSimulationWorld() { return simulationWorld; }
    public RaceProgressTracker getProgressTracker() { return progressTracker; }
    public FixedTimestepRunner getFixedTimestepRunner() { return fixedTimestepRunner; }

    /**
     * Default no-op message broadcaster for standalone unit tests.
     */
    public static class NoopMessageBroadcaster implements MessageBroadcaster {
        @Override
        public void sendToSession(String sessionId, MessageEnvelope<?> message) {}
        @Override
        public void broadcast(String roomId, MessageEnvelope<?> message) {}
    }
}
