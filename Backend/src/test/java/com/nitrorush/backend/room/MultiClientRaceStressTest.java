package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TestTimeProvider;
import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.PlayerInputPayload;
import com.nitrorush.backend.protocol.payload.RaceStatePayload;
import com.nitrorush.backend.protocol.payload.VehicleTelemetry;
import com.nitrorush.backend.session.GuestSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.4 Phase 4.4: Multi-Client Race Stress & Lifecycle Tests")
public class MultiClientRaceStressTest {

    private TrackDefinition track;
    private TestTimeProvider timeProvider;
    private RecordingBroadcaster broadcaster;

    private static class RecordingBroadcaster implements MessageBroadcaster {
        final List<MessageEnvelope<?>> sentMessages = new CopyOnWriteArrayList<>();

        @Override
        public void sendToSession(String sessionId, MessageEnvelope<?> message) {
            sentMessages.add(message);
        }

        @Override
        public void broadcast(String roomId, MessageEnvelope<?> message) {
            sentMessages.add(message);
        }

        public void clear() {
            sentMessages.clear();
        }
    }

    @BeforeEach
    public void setup() {
        track = TrackRegistry.getStatic("coastal-rush");
        timeProvider = new TestTimeProvider(2000000L);
        broadcaster = new RecordingBroadcaster();
    }

    @Test
    @DisplayName("2-Player Race: End-to-end countdown sync, input streaming, and snapshot broadcast")
    public void test2PlayerRaceSimulation() {
        Room room = new Room("race-2p", track, timeProvider, broadcaster);

        GuestSession p1 = new GuestSession(UUID.randomUUID().toString(), "Racer1", "av1");
        GuestSession p2 = new GuestSession(UUID.randomUUID().toString(), "Racer2", "av2");

        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);

        // Advance 15s collection window -> COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Advance 3.0s countdown -> RACING
        timeProvider.advanceSeconds(3.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());
        broadcaster.clear();

        // Simulate 40 ticks (2.0 seconds) of 20 TPS racing
        for (int tick = 1; tick <= 40; tick++) {
            room.handleInput(p1.getGuestToken(), new PlayerInputPayload("race-2p", tick, 1.0, 0.0, 0.0, false, false));
            room.handleInput(p2.getGuestToken(), new PlayerInputPayload("race-2p", tick, 0.8, 0.0, 0.1, false, false));
            room.stepSimulation(0.050);
        }

        // Verify broadcast snapshots (40 ticks * 2 connected player sessions = 80 total envelopes)
        long raceStateCount = broadcaster.sentMessages.stream()
                .filter(m -> m.getType() == MessageType.RACE_STATE)
                .count();
        assertEquals(80, raceStateCount, "Must broadcast 80 RACE_STATE envelopes (40 per connected racer)");

        Map<String, VehicleState> snapshot = room.getSimulationWorld().getSnapshot();
        VehicleState s1 = snapshot.get("p1");
        VehicleState s2 = snapshot.get("p2");
        assertNotNull(s1);
        assertNotNull(s2);
        assertTrue(s1.getForwardSpeed() > 100.0);
        assertTrue(s2.getForwardSpeed() > 80.0);
    }

    @Test
    @DisplayName("4-Player Race: Mid-race disconnect, 15s grace period, and reconnection recovery")
    public void test4PlayerRaceWithDisconnectAndReconnect() {
        RoomManager roomManager = new RoomManager(new TrackRegistry(), timeProvider, broadcaster);
        Room room = roomManager.createRoom("coastal-rush");
        List<GuestSession> players = new ArrayList<>();

        for (int i = 1; i <= 4; i++) {
            GuestSession p = new GuestSession(UUID.randomUUID().toString(), "Racer" + i, "av" + i);
            players.add(p);
            roomManager.joinRoom(room.getRoomId(), p, "bolt-gt", "sess-" + i);
            roomManager.setReady(p.getGuestToken(), room.getRoomId(), true);
        }

        // Advance collection window -> COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Advance 3.0s countdown -> RACING
        timeProvider.advanceSeconds(3.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());

        // Simulate 20 ticks (1 second) of racing
        for (int tick = 1; tick <= 20; tick++) {
            for (GuestSession p : players) {
                room.handleInput(p.getGuestToken(), new PlayerInputPayload(room.getRoomId(), tick, 1.0, 0.0, 0.0, false, false));
            }
            room.stepSimulation(0.050);
        }

        // Racer 4 disconnects
        GuestSession p4 = players.get(3);
        roomManager.handleDisconnect("sess-4", p4.getGuestToken());

        PlayerSlot slot4 = room.getPlayerSlots().stream()
                .filter(s -> s.getGuestToken().equals(p4.getGuestToken()))
                .findFirst().orElseThrow();
        assertFalse(slot4.isConnected(), "Slot must be marked disconnected");
        assertTrue(slot4.getReconnectDeadlineMs() > timeProvider.currentTimeMillis());

        // Continue simulation while P4 is disconnected (another 20 ticks)
        broadcaster.clear();
        for (int tick = 21; tick <= 40; tick++) {
            for (int i = 0; i < 3; i++) {
                room.handleInput(players.get(i).getGuestToken(), new PlayerInputPayload(room.getRoomId(), tick, 1.0, 0.0, 0.0, false, false));
            }
            room.stepSimulation(0.050);
        }

        // Broadcasted RACE_STATE must reflect P4 as DISCONNECTED
        MessageEnvelope<?> latestState = broadcaster.sentMessages.stream()
                .filter(m -> m.getType() == MessageType.RACE_STATE)
                .reduce((first, second) -> second)
                .orElseThrow();
        RaceStatePayload payload = (RaceStatePayload) latestState.getPayload();
        VehicleTelemetry t4 = payload.getVehicles().stream()
                .filter(v -> v.getId().equals(slot4.getPlayerId()))
                .findFirst().orElseThrow();
        assertEquals("DISCONNECTED", t4.getStatus());

        // P4 reconnects with new session ID
        boolean reconnected = roomManager.handleReconnect(room.getRoomId(), p4.getGuestToken(), "sess-4-reconnect", 20);
        assertTrue(reconnected, "P4 must successfully reconnect within grace window");
        assertTrue(slot4.isConnected(), "Slot must be marked reconnected");

        // Step simulation after reconnection: P4 status returns to RACING
        broadcaster.clear();
        room.stepSimulation(0.050);
        MessageEnvelope<?> postReconnectState = broadcaster.sentMessages.stream()
                .filter(m -> m.getType() == MessageType.RACE_STATE)
                .findFirst().orElseThrow();
        RaceStatePayload postPayload = (RaceStatePayload) postReconnectState.getPayload();
        VehicleTelemetry postT4 = postPayload.getVehicles().stream()
                .filter(v -> v.getId().equals(slot4.getPlayerId()))
                .findFirst().orElseThrow();
        assertEquals("RACING", postT4.getStatus());
    }

    @Test
    @DisplayName("8-Player Full Grid Stress: Concurrent multi-threaded inputs across all 8 racer slots")
    public void test8PlayerFullGridStress() throws Exception {
        Room room = new Room("race-8p-stress", track, timeProvider, broadcaster);
        List<GuestSession> players = new ArrayList<>();

        for (int i = 1; i <= 8; i++) {
            GuestSession p = new GuestSession(UUID.randomUUID().toString(), "Racer" + i, "av" + i);
            players.add(p);
            room.join(p, "bolt-gt", "sess-" + i);
            room.setReady(p.getGuestToken(), true);
        }

        // In an 8-player room where all 8 are ready, transition to COUNTDOWN is immediate
        timeProvider.advanceSeconds(0.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState(), "8 ready players should trigger immediate COUNTDOWN");

        // Advance 3.0s countdown -> RACING
        timeProvider.advanceSeconds(3.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());
        broadcaster.clear();

        // 8 concurrent client threads sending 60 ticks of input
        int numTicks = 60;
        ExecutorService executor = Executors.newFixedThreadPool(8);
        CountDownLatch latch = new CountDownLatch(8);
        AtomicInteger totalPacketsAccepted = new AtomicInteger(0);

        for (int pIdx = 0; pIdx < 8; pIdx++) {
            final int playerIndex = pIdx;
            final GuestSession session = players.get(playerIndex);

            executor.submit(() -> {
                try {
                    for (int seq = 1; seq <= numTicks; seq++) {
                        double throttle = 0.5 + (playerIndex * 0.06);
                        double steer = (seq % 10 == 0) ? 0.2 : 0.0;
                        PlayerInputPayload input = new PlayerInputPayload(
                                "race-8p-stress",
                                seq,
                                throttle,
                                0.0,
                                steer,
                                false,
                                false
                        );
                        room.handleInput(session.getGuestToken(), input);
                        totalPacketsAccepted.incrementAndGet();
                        // Small thread sleep to simulate network inter-packet arrival
                        Thread.sleep(2);
                    }
                } catch (Exception ignored) {
                } finally {
                    latch.countDown();
                }
            });
        }

        // Simultaneously step the authoritative server physics simulation
        for (int tick = 1; tick <= numTicks; tick++) {
            room.stepSimulation(0.050);
            timeProvider.advanceMillis(50);
            Thread.sleep(3);
        }

        assertTrue(latch.await(10, TimeUnit.SECONDS), "Client input streaming threads timed out");
        executor.shutdown();

        // Step simulation for another 30 ticks to ensure all accepted inputs are integrated into physics
        for (int tick = 1; tick <= 30; tick++) {
            room.stepSimulation(0.050);
            timeProvider.advanceMillis(50);
        }

        assertEquals(8 * numTicks, totalPacketsAccepted.get(), "All 480 input packets must be processed");

        // Verify simulation world snapshot contains all 8 vehicles with distinct states
        Map<String, VehicleState> snapshot = room.getSimulationWorld().getSnapshot();
        assertEquals(8, snapshot.size(), "Snapshot must contain all 8 active vehicles");

        for (int i = 1; i <= 8; i++) {
            VehicleState v = snapshot.get("p" + i);
            assertNotNull(v, "Vehicle state for p" + i + " must exist");
            double speed = Math.hypot(v.getVx(), v.getVy());
            assertTrue(speed > 1.0 || Math.abs(v.getForwardSpeed()) > 1.0,
                    "Vehicle p" + i + " must have moved under throttle (speed=" + speed + ", forwardSpeed=" + v.getForwardSpeed() + ")");
        }

        // Verify latest broadcasted state contains all 8 vehicle telemetries
        MessageEnvelope<?> latestState = broadcaster.sentMessages.stream()
                .filter(m -> m.getType() == MessageType.RACE_STATE)
                .reduce((first, second) -> second)
                .orElseThrow();
        RaceStatePayload payload = (RaceStatePayload) latestState.getPayload();
        assertEquals(8, payload.getVehicles().size(), "RACE_STATE must broadcast all 8 vehicle telemetries");
        assertEquals(8, payload.getAckInputSeq().size(), "Ack sequences must be tracked for all 8 players");
    }
}
