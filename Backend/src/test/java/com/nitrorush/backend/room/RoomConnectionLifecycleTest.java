package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TestTimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.PlayerDisconnectedPayload;
import com.nitrorush.backend.protocol.payload.PlayerReconnectedPayload;
import com.nitrorush.backend.session.GuestSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.3: Connection & 15-Second Reconnect Lifecycle Tests")
public class RoomConnectionLifecycleTest {

    private TrackDefinition track;
    private TestTimeProvider timeProvider;
    private RecordingBroadcaster broadcaster;
    private RoomManager roomManager;
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
        roomManager = new RoomManager(new TrackRegistry(), timeProvider, broadcaster);

        room = roomManager.createRoom("coastal-rush");

        p1 = new GuestSession(UUID.randomUUID().toString(), "Racer1", "av1");
        p2 = new GuestSession(UUID.randomUUID().toString(), "Racer2", "av2");

        roomManager.joinRoom(room.getRoomId(), p1, "bolt-gt", "sess-1");
        roomManager.joinRoom(room.getRoomId(), p2, "viper-r", "sess-2");

        roomManager.setReady(p1.getGuestToken(), room.getRoomId(), true);
        roomManager.setReady(p2.getGuestToken(), room.getRoomId(), true);

        // Advance 15s collection window to enter COUNTDOWN
        timeProvider.advanceSeconds(15.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.COUNTDOWN, room.getState());

        // Advance 3.0s countdown into RACING state
        timeProvider.advanceSeconds(3.1);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());
        broadcaster.sentMessages.clear();
    }

    @Test
    @DisplayName("Disconnect during race sets inert input, starts 15s grace, and broadcasts PLAYER_DISCONNECTED")
    public void testDisconnectDuringRace() {
        roomManager.handleDisconnect("sess-1", p1.getGuestToken());

        PlayerSlot slot1 = room.getPlayerSlots().get(0);
        assertFalse(slot1.isConnected(), "Slot must be marked disconnected");
        assertNull(slot1.getSessionId());
        assertTrue(slot1.getReconnectDeadlineMs() > 0);
        assertEquals(timeProvider.currentTimeMillis() + 15_000L, slot1.getReconnectDeadlineMs());

        // Check broadcast PLAYER_DISCONNECTED
        boolean foundDisconnectMsg = broadcaster.sentMessages.stream()
                .anyMatch(m -> m.getType() == MessageType.PLAYER_DISCONNECTED);
        assertTrue(foundDisconnectMsg, "Expected PLAYER_DISCONNECTED broadcast to other players");
    }

    @Test
    @DisplayName("Successful reconnection within 15 seconds restores player and broadcasts PLAYER_RECONNECTED")
    public void testSuccessfulReconnectionWithinWindow() {
        roomManager.handleDisconnect("sess-1", p1.getGuestToken());
        broadcaster.sentMessages.clear();

        // Advance 8 seconds (well within 15-second window)
        timeProvider.advanceSeconds(8.0);
        room.update(timeProvider.currentTimeMillis());

        // Reconnect with new session
        boolean ok = roomManager.handleReconnect(room.getRoomId(), p1.getGuestToken(), "sess-new-1", 100);
        assertTrue(ok);

        PlayerSlot slot1 = room.getPlayerSlots().get(0);
        assertTrue(slot1.isConnected());
        assertEquals("sess-new-1", slot1.getSessionId());
        assertEquals(0, slot1.getReconnectDeadlineMs());

        // Verify PLAYER_RECONNECTED broadcast
        boolean foundReconnectedMsg = broadcaster.sentMessages.stream()
                .anyMatch(m -> m.getType() == MessageType.PLAYER_RECONNECTED);
        assertTrue(foundReconnectedMsg, "Expected PLAYER_RECONNECTED broadcast");

        // Verify resync snapshot was dispatched to new session
        boolean foundResyncSnapshot = broadcaster.sentMessages.stream()
                .anyMatch(m -> m.getType() == MessageType.RACE_STATE);
        assertTrue(foundResyncSnapshot, "Expected immediate state resynchronization snapshot to reconnecting player");
    }

    @Test
    @DisplayName("Reconnection past 15 seconds fails with SESSION_EXPIRED and racer marked DNF")
    public void testExpiredReconnection() {
        roomManager.handleDisconnect("sess-1", p1.getGuestToken());

        // Advance 16 seconds (exceeding 15s window)
        timeProvider.advanceSeconds(16.0);
        room.update(timeProvider.currentTimeMillis());

        // Attempt reconnect
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                roomManager.handleReconnect(room.getRoomId(), p1.getGuestToken(), "sess-late", 100));
        assertEquals(ErrorCode.SESSION_EXPIRED, ex.getErrorCode());

        // Racer marked DNF in tracker
        var comp1 = room.getProgressTracker().getCompetitor("p1");
        assertNotNull(comp1);
        assertEquals("DNF", comp1.getStatus());
    }

    @Test
    @DisplayName("Impersonation protection: invalid guest token cannot steal player slot")
    public void testImpersonationProtection() {
        roomManager.handleDisconnect("sess-1", p1.getGuestToken());

        // Malicious client attempts to reconnect using someone else's player ID with a fake token
        String fakeToken = UUID.randomUUID().toString();
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                roomManager.handleReconnect(room.getRoomId(), fakeToken, "sess-hacker", 100));
        assertEquals(ErrorCode.INVALID_RECONNECT_TOKEN, ex.getErrorCode());
    }

    @Test
    @DisplayName("Room cleanup removes CLOSED rooms only; active racing rooms are never removed")
    public void testRoomCleanupSafety() {
        assertEquals(1, roomManager.getActiveRoomCount());

        // Calling cleanup while room is RACING must not remove it
        roomManager.cleanupClosedRooms();
        assertEquals(1, roomManager.getActiveRoomCount());

        // Create empty room and leave it -> transitions to CLOSED
        Room emptyRoom = roomManager.createRoom("desert-heat");
        GuestSession temp = new GuestSession(UUID.randomUUID().toString(), "Temp", "av");
        roomManager.joinRoom(emptyRoom.getRoomId(), temp, "bolt-gt", "sess-temp");
        assertEquals(2, roomManager.getActiveRoomCount());

        roomManager.leaveRoom(temp.getGuestToken());
        assertEquals(RoomState.CLOSED, emptyRoom.getState());

        // Now cleanup removes the closed room, but preserves the active racing room
        roomManager.cleanupClosedRooms();
        assertEquals(1, roomManager.getActiveRoomCount());
        assertTrue(roomManager.getRoom(room.getRoomId()).isPresent());
        assertTrue(roomManager.getRoom(emptyRoom.getRoomId()).isEmpty());
    }
}
