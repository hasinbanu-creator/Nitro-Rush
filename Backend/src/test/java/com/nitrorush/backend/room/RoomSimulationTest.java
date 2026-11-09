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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.3: Authoritative Simulation & 20 TPS Tests")
public class RoomSimulationTest {

    private TrackDefinition track;
    private TestTimeProvider timeProvider;
    private RecordingBroadcaster broadcaster;
    private Room room;
    private GuestSession p1;
    private GuestSession p2;

    private static class RecordingBroadcaster implements MessageBroadcaster {
        final List<MessageEnvelope<?>> sentMessages = new ArrayList<>();

        @Override
        public void sendToSession(String sessionId, MessageEnvelope<?> message) {
            sentMessages.add(message);
        }

        @Override
        public void broadcast(String roomId, MessageEnvelope<?> message) {
            sentMessages.add(message);
        }
    }

    @BeforeEach
    public void setup() {
        track = TrackRegistry.getStatic("coastal-rush");
        timeProvider = new TestTimeProvider(1000000L);
        broadcaster = new RecordingBroadcaster();
        room = new Room("sim-room-1", track, timeProvider, broadcaster);

        p1 = new GuestSession(UUID.randomUUID().toString(), "Racer1", "av1");
        p2 = new GuestSession(UUID.randomUUID().toString(), "Racer2", "av2");

        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "titan-v8", "sess-2");

        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);

        // Advance 15s collection window to enter COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Advance 3.0s countdown to RACING state
        timeProvider.advanceSeconds(3.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());
        broadcaster.sentMessages.clear();
    }

    @Test
    @DisplayName("Fixed 50ms timestep: 20 discrete 50ms intervals execute exactly 20 simulation ticks (20 TPS)")
    public void testFixedTimestepExecutionRate() {
        int totalTicks = 0;
        for (int i = 0; i < 20; i++) {
            totalTicks += room.stepSimulation(0.050);
        }
        assertEquals(20, totalTicks, "20 iterations of 50ms must execute exactly 20 ticks at 50ms fixed timestep");
        assertEquals(20, room.getSimulationWorld().getTick());
    }

    @Test
    @DisplayName("Multiple independent players: different inputs produce different kinematics")
    public void testMultipleIndependentPlayers() {
        // P1 full throttle
        room.handleInput(p1.getGuestToken(), new PlayerInputPayload("sim-room-1", 1, 1.0, 0.0, 0.0, false, false));
        // P2 no throttle, idle
        room.handleInput(p2.getGuestToken(), new PlayerInputPayload("sim-room-1", 1, 0.0, 0.0, 0.0, false, false));

        // Step 20 ticks (1.0 second)
        for (int i = 0; i < 20; i++) {
            room.stepSimulation(0.050);
        }

        Map<String, VehicleState> snapshot = room.getSimulationWorld().getSnapshot();
        VehicleState s1 = snapshot.get("p1");
        VehicleState s2 = snapshot.get("p2");

        assertNotNull(s1);
        assertNotNull(s2);

        // P1 must have accelerated; P2 must remain stationary or idle
        assertTrue(s1.getForwardSpeed() > 100.0, "P1 forward speed must increase under throttle");
        assertEquals(0.0, s2.getForwardSpeed(), 1.0, "P2 should have zero or near-zero forward speed");
        assertTrue(s1.getX() > s2.getX(), "P1 must have moved ahead of P2");
    }

    @Test
    @DisplayName("Input sanitization: out-of-range throttle, brake and steer are safely clamped")
    public void testInputSanitization() {
        // Send extreme out-of-bounds input
        PlayerInputPayload malicious = new PlayerInputPayload("sim-room-1", 10, 50.0, -10.0, 99.0, false, false);
        room.handleInput(p1.getGuestToken(), malicious);

        PlayerSlot slot = room.getPlayerSlots().get(0);
        assertEquals(1.0, slot.getLatestInput().getThrottle(), 1e-6, "Throttle must be clamped to 1.0");
        assertEquals(0.0, slot.getLatestInput().getBrake(), 1e-6, "Brake must be clamped to 0.0");
        assertEquals(1.0, slot.getLatestInput().getSteer(), 1e-6, "Steer must be clamped to 1.0");
    }

    @Test
    @DisplayName("Anti-cheat guarantee: server never accepts client-authoritative coordinates")
    public void testNoClientAuthoritativePositions() {
        // PlayerInputPayload does not even have x, y, vx, vy, lap, checkpoint fields!
        // The server physics engine is the sole authoritative source of truth.
        VehicleState before = room.getSimulationWorld().getSnapshot().get("p1");
        double initialX = before.getX();

        // Send valid input
        room.handleInput(p1.getGuestToken(), new PlayerInputPayload("sim-room-1", 1, 1.0, 0.0, 0.0, false, false));
        room.stepSimulation(0.050);

        VehicleState after = room.getSimulationWorld().getSnapshot().get("p1");
        // State updated strictly by physics engine
        assertTrue(after.getX() >= initialX);
    }

    @Test
    @DisplayName("RACE_STATE snapshot broadcast contains 20 Hz telemetry and ackInputSeq")
    public void testSnapshotBroadcast() {
        room.handleInput(p1.getGuestToken(), new PlayerInputPayload("sim-room-1", 105, 1.0, 0.0, 0.1, false, false));
        room.stepSimulation(0.050);

        // Find broadcast RACE_STATE
        MessageEnvelope<?> stateEnv = broadcaster.sentMessages.stream()
                .filter(m -> m.getType() == MessageType.RACE_STATE)
                .findFirst()
                .orElse(null);

        assertNotNull(stateEnv, "Expected RACE_STATE snapshot envelope");
        assertTrue(stateEnv.getPayload() instanceof RaceStatePayload);

        RaceStatePayload payload = (RaceStatePayload) stateEnv.getPayload();
        assertEquals(1, payload.getServerTick());
        assertEquals(50, payload.getServerTimeMs());
        assertEquals(105L, payload.getAckInputSeq().get("p1"));

        assertEquals(2, payload.getVehicles().size());
        VehicleTelemetry t1 = payload.getVehicles().stream()
                .filter(v -> v.getId().equals("p1"))
                .findFirst().orElseThrow();
        assertEquals("p1", t1.getId());
        assertEquals(1, t1.getLap());
        assertEquals("RACING", t1.getStatus());
    }

    @Test
    @DisplayName("Overload protection clamps accumulator: server avoids spiral of death")
    public void testOverloadProtection() {
        // Large 5.0-second pause/delay in wall clock
        int executed = room.stepSimulation(5.0);
        // FixedTimestepRunner clamps accumulator to 250ms (max 5 ticks)
        assertEquals(5, executed, "Accumulator overload clamping must limit execution to 5 ticks (250ms)");
        assertEquals(0.0, room.getFixedTimestepRunner().getAccumulator(), 1e-6);
    }
}
