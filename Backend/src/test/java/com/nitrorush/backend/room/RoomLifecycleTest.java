package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TestTimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.session.GuestSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.3: Room Lifecycle & State Machine Tests")
public class RoomLifecycleTest {

    private TrackDefinition track;
    private TestTimeProvider timeProvider;
    private RecordingBroadcaster broadcaster;
    private Room room;

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
        room = new Room("room-test-1", track, timeProvider, broadcaster);
    }

    private GuestSession createGuest(String name) {
        return new GuestSession(UUID.randomUUID().toString(), name, "avatar-1");
    }

    @Test
    @DisplayName("Room initializes in WAITING state with zero players")
    public void testInitialState() {
        assertEquals(RoomState.WAITING, room.getState());
        assertEquals(0, room.getPlayerCount());
        assertEquals("room-test-1", room.getRoomId());
        assertEquals(track.getId(), room.getTrack().getId());
    }

    @Test
    @DisplayName("Players can join room up to capacity limit of 8 players")
    public void testJoinUpToCapacity() {
        for (int i = 1; i <= 8; i++) {
            GuestSession guest = createGuest("Racer_" + i);
            PlayerSlot slot = room.join(guest, "bolt-gt", "sess-" + i);

            assertNotNull(slot);
            assertEquals("P" + i, slot.getSlotId());
            assertEquals("p" + i, slot.getPlayerId());
            assertEquals("Racer_" + i, slot.getDisplayName());
            assertEquals(i, room.getPlayerCount());
        }

        assertEquals(8, room.getPlayerCount());

        // 9th player must be rejected with ROOM_FULL
        GuestSession excessGuest = createGuest("Racer_9");
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                room.join(excessGuest, "bolt-gt", "sess-9"));
        assertEquals(ErrorCode.ROOM_FULL, ex.getErrorCode());
        assertEquals(8, room.getPlayerCount());
    }

    @Test
    @DisplayName("Player leave removes player slot and broadcasts PLAYER_LEFT")
    public void testPlayerLeave() {
        GuestSession p1 = createGuest("Player1");
        GuestSession p2 = createGuest("Player2");

        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");
        assertEquals(2, room.getPlayerCount());

        broadcaster.sentMessages.clear();
        boolean left = room.leave(p1.getGuestToken());
        assertTrue(left);
        assertEquals(1, room.getPlayerCount());

        // Check PLAYER_LEFT was broadcast
        boolean leftMessageFound = broadcaster.sentMessages.stream()
                .anyMatch(m -> m.getType() == MessageType.PLAYER_LEFT);
        assertTrue(leftMessageFound, "Expected PLAYER_LEFT message to be sent to remaining members");
    }

    @Test
    @DisplayName("Room transitions to CLOSED when all players leave in WAITING state")
    public void testRoomClosesWhenEmpty() {
        GuestSession p1 = createGuest("Player1");
        room.join(p1, "bolt-gt", "sess-1");
        assertEquals(RoomState.WAITING, room.getState());

        room.leave(p1.getGuestToken());
        assertEquals(0, room.getPlayerCount());
        assertEquals(RoomState.CLOSED, room.getState());
    }

    @Test
    @DisplayName("Vehicle selection validates valid cars and rejects unknown cars")
    public void testVehicleSelection() {
        GuestSession p1 = createGuest("Player1");
        room.join(p1, "bolt-gt", "sess-1");

        room.selectCar(p1.getGuestToken(), "viper-r");
        assertEquals("viper-r", room.getPlayerSlots().get(0).getCarId());

        room.selectCar(p1.getGuestToken(), "rally-apex");
        assertEquals("rally-apex", room.getPlayerSlots().get(0).getCarId());

        room.selectCar(p1.getGuestToken(), "titan-v8");
        assertEquals("titan-v8", room.getPlayerSlots().get(0).getCarId());

        // Invalid car ID rejected
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                room.selectCar(p1.getGuestToken(), "formula-one-rocket"));
        assertEquals(ErrorCode.INVALID_CAR_ID, ex.getErrorCode());
    }

    @Test
    @DisplayName("Ready status toggling and minimum 2 player requirement")
    public void testReadyToggleAndMinimumPlayers() {
        GuestSession p1 = createGuest("Player1");
        room.join(p1, "bolt-gt", "sess-1");

        // 1 player ready does NOT start countdown
        room.setReady(p1.getGuestToken(), true);
        assertTrue(room.getPlayerSlots().get(0).isReady());
        assertEquals(RoomState.WAITING, room.getState());
        assertEquals(0, room.getReadyCountdownStartedAtMs());

        // Second player joins
        GuestSession p2 = createGuest("Player2");
        room.join(p2, "viper-r", "sess-2");
        assertEquals(RoomState.WAITING, room.getState());

        // Once second player is ready, 15-second collection window starts (remains in WAITING)
        room.setReady(p2.getGuestToken(), true);
        assertEquals(RoomState.WAITING, room.getState());
        assertTrue(room.getReadyCountdownStartedAtMs() > 0);

        // Advance 15.1 seconds -> transitions to COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("Immediate start when 8 players join and are all ready")
    public void testImmediateStartAt8Players() {
        List<GuestSession> guests = new ArrayList<>();
        for (int i = 1; i <= 8; i++) {
            GuestSession g = createGuest("Player_" + i);
            guests.add(g);
            room.join(g, "bolt-gt", "sess-" + i);
        }

        assertEquals(RoomState.WAITING, room.getState());

        // Ready up players 1 through 7: still in WAITING
        for (int i = 0; i < 7; i++) {
            room.setReady(guests.get(i).getGuestToken(), true);
            assertEquals(RoomState.WAITING, room.getState());
        }

        // 8th player readies up -> immediate start to COUNTDOWN
        room.setReady(guests.get(7).getGuestToken(), true);
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("15-second collection window when at least 2 players are ready")
    public void testReadyCollectionWindow() {
        GuestSession p1 = createGuest("P1");
        GuestSession p2 = createGuest("P2");
        GuestSession p3 = createGuest("P3");

        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");
        room.join(p3, "rally-apex", "sess-3");

        // P1 and P2 ready up (2 out of 3 ready) -> starts 15-second collection window
        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        assertEquals(RoomState.WAITING, room.getState());

        // Advance 10 seconds (less than 15s) -> still WAITING
        timeProvider.advanceSeconds(10.0);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.WAITING, room.getState());

        // Advance 6 more seconds (total 16s >= 15s window) -> transitions to COUNTDOWN!
        timeProvider.advanceSeconds(6.0);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("30-second lobby timeout triggers race start if at least 2 players ready")
    public void testLobbyTimeout() {
        GuestSession p1 = createGuest("P1");
        GuestSession p2 = createGuest("P2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        // Set P1 ready only
        room.setReady(p1.getGuestToken(), true);

        // Advance 25 seconds: still WAITING
        timeProvider.advanceSeconds(25.0);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.WAITING, room.getState());

        // Now P2 readies up at second 25 (collection window starts at t=25s, expiring at t=40s)
        room.setReady(p2.getGuestToken(), true);
        assertEquals(RoomState.WAITING, room.getState());
        assertEquals(1025000L, room.getReadyCountdownStartedAtMs());

        // Advance 5.1s to t=30.1s: overall 30s lobby timeout triggers COUNTDOWN before 15s collection window (at t=40s)
        timeProvider.advanceSeconds(5.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("Countdown timer executes for 3.0 seconds then starts race with controls unlocked")
    public void testCountdownTimerToRacing() {
        GuestSession p1 = createGuest("P1");
        GuestSession p2 = createGuest("P2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        assertEquals(RoomState.WAITING, room.getState());

        // Advance 15.1 seconds to trigger COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Controls are locked in COUNTDOWN
        assertTrue(room.getSimulationWorld().getVehicleSlot("p1").isControlsLocked());
        assertTrue(room.getSimulationWorld().getVehicleSlot("p2").isControlsLocked());

        // Advance 2 seconds (less than 3s)
        timeProvider.advanceSeconds(2.0);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Advance 1.1 seconds (total 3.1s >= 3.0s) -> transitions to RACING!
        timeProvider.advanceSeconds(1.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());

        // Controls must be unlocked
        assertFalse(room.getSimulationWorld().getVehicleSlot("p1").isControlsLocked());
        assertFalse(room.getSimulationWorld().getVehicleSlot("p2").isControlsLocked());
    }

    @Test
    @DisplayName("Invalid state transitions are strictly rejected")
    public void testInvalidStateTransitions() {
        GuestSession p1 = createGuest("P1");
        GuestSession p2 = createGuest("P2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");
        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);

        // Advance 15.1 seconds to trigger COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Cannot join in COUNTDOWN
        GuestSession lateGuest = createGuest("LateRacer");
        ProtocolException exJoin = assertThrows(ProtocolException.class, () ->
                room.join(lateGuest, "bolt-gt", "sess-late"));
        assertEquals(ErrorCode.ROOM_STATE_INVALID, exJoin.getErrorCode());

        // Cannot toggle ready in COUNTDOWN
        ProtocolException exReady = assertThrows(ProtocolException.class, () ->
                room.setReady(p1.getGuestToken(), false));
        assertEquals(ErrorCode.ROOM_STATE_INVALID, exReady.getErrorCode());

        // Cannot change car in COUNTDOWN
        ProtocolException exCar = assertThrows(ProtocolException.class, () ->
                room.selectCar(p1.getGuestToken(), "titan-v8"));
        assertEquals(ErrorCode.ROOM_NOT_IN_LOBBY, exCar.getErrorCode());
    }

    // ==========================================
    // Milestone 8.3 Corrective Fix Regression Suite
    // ==========================================

    @Test
    @DisplayName("Regression 1: Exactly 2 joined players both ready remains in WAITING during 15s collection window")
    public void testExactlyTwoReadyPlayersRemainsWaitingDuringCollectionWindow() {
        GuestSession p1 = createGuest("Player1");
        GuestSession p2 = createGuest("Player2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);

        // Crucial check: Room MUST NOT start countdown immediately when exactly 2 players are ready
        assertEquals(RoomState.WAITING, room.getState());
        assertEquals(1000000L, room.getReadyCountdownStartedAtMs());

        // Advance 10 seconds into the 15-second collection window
        timeProvider.advanceSeconds(10.0);
        room.update(timeProvider.currentTimeMillis());

        // Room must still be in WAITING state waiting for collection window to expire or more players
        assertEquals(RoomState.WAITING, room.getState());
        assertEquals(1000000L, room.getReadyCountdownStartedAtMs());
    }

    @Test
    @DisplayName("Regression 2: Exactly 2 ready players transitions to COUNTDOWN after 15-second collection window expires")
    public void testExactlyTwoReadyPlayersTransitionsToCountdownAfter15Seconds() {
        GuestSession p1 = createGuest("Player1");
        GuestSession p2 = createGuest("Player2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        assertEquals(RoomState.WAITING, room.getState());

        // Advance past 15.0s (15.1s)
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());

        // Exactly 2 players remain ready -> room transitions to COUNTDOWN
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("Regression 3: Additional players joining during collection window do NOT reset original deadline")
    public void testAdditionalPlayersJoiningDoNotResetOriginalDeadline() {
        GuestSession p1 = createGuest("Player1");
        GuestSession p2 = createGuest("Player2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        // P1 and P2 ready at t=1,000,000 ms -> original deadline is t=1,015,000 ms
        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        long originalDeadlineMs = room.getReadyCountdownStartedAtMs();
        assertEquals(1000000L, originalDeadlineMs);

        // Advance 5 seconds to t=1,005,000 ms
        timeProvider.advanceSeconds(5.0);
        room.update(timeProvider.currentTimeMillis());

        // Player 3 joins during collection window
        GuestSession p3 = createGuest("Player3");
        room.join(p3, "rally-apex", "sess-3");

        // Collection start timestamp must remain untouched (preserving original deadline)
        assertEquals(originalDeadlineMs, room.getReadyCountdownStartedAtMs());
        assertEquals(RoomState.WAITING, room.getState());

        // Advance 10.1 seconds to t=1,015,100 ms (elapsed since start: 15.1s >= 15.0s, elapsed since p3 join: only 10.1s)
        timeProvider.advanceSeconds(10.1);
        room.update(timeProvider.currentTimeMillis());

        // Must transition to COUNTDOWN because original 15s deadline expired
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("Regression 4: Reaching 8 players with all 8 ready starts COUNTDOWN immediately without waiting 15s")
    public void testReachingEightPlayersWithAllReadyStartsImmediately() {
        List<GuestSession> guests = new ArrayList<>();
        for (int i = 1; i <= 8; i++) {
            GuestSession g = createGuest("Racer" + i);
            guests.add(g);
            room.join(g, "bolt-gt", "sess-" + i);
        }

        // Ready up players 1 through 7 -> 15s collection timer runs, but room remains in WAITING
        for (int i = 0; i < 7; i++) {
            room.setReady(guests.get(i).getGuestToken(), true);
            assertEquals(RoomState.WAITING, room.getState());
        }

        // 8th player readies up -> triggers immediate transition to COUNTDOWN with zero delay
        room.setReady(guests.get(7).getGuestToken(), true);
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }

    @Test
    @DisplayName("Regression 5: Ready count dropping below 2 cancels and resets collection timer")
    public void testReadyCountDroppingBelowTwoCancelsTimer() {
        GuestSession p1 = createGuest("Player1");
        GuestSession p2 = createGuest("Player2");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");

        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        assertTrue(room.getReadyCountdownStartedAtMs() > 0);

        // Advance 5 seconds
        timeProvider.advanceSeconds(5.0);
        room.update(timeProvider.currentTimeMillis());

        // Player 2 toggles unready -> ready count drops to 1 (< 2)
        room.setReady(p2.getGuestToken(), false);
        assertFalse(room.getPlayerSlots().get(1).isReady());

        // Collection timer must be cancelled and reset to 0
        assertEquals(0L, room.getReadyCountdownStartedAtMs());
        assertEquals(RoomState.WAITING, room.getState());

        // Advance 20 more seconds and update -> room must stay in WAITING
        timeProvider.advanceSeconds(20.0);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.WAITING, room.getState());
    }

    @Test
    @DisplayName("Regression 6: Unreadying with at least 2 remaining ready players preserves original deadline")
    public void testReadyCountRemainingAtLeastTwoPreservesOriginalDeadline() {
        GuestSession p1 = createGuest("Player1");
        GuestSession p2 = createGuest("Player2");
        GuestSession p3 = createGuest("Player3");
        room.join(p1, "bolt-gt", "sess-1");
        room.join(p2, "viper-r", "sess-2");
        room.join(p3, "rally-apex", "sess-3");

        // P1, P2, P3 all ready up at t=1,000,000 ms
        room.setReady(p1.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        room.setReady(p3.getGuestToken(), true);
        long originalStartMs = room.getReadyCountdownStartedAtMs();
        assertEquals(1000000L, originalStartMs);

        // Advance 5 seconds to t=1,005,000 ms
        timeProvider.advanceSeconds(5.0);
        room.update(timeProvider.currentTimeMillis());

        // P3 unreadies -> 2 players remain ready (P1 and P2)
        room.setReady(p3.getGuestToken(), false);

        // Collection deadline must remain preserved at original timestamp
        assertEquals(originalStartMs, room.getReadyCountdownStartedAtMs());
        assertEquals(RoomState.WAITING, room.getState());

        // Advance 10.1 seconds to t=1,015,100 ms (15.1s from original start)
        timeProvider.advanceSeconds(10.1);
        room.update(timeProvider.currentTimeMillis());

        // Original 15-second collection window expires with 2 ready players -> transitions to COUNTDOWN
        assertEquals(RoomState.COUNTDOWN, room.getState());
    }
}
