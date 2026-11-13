package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.matchmaking.MatchmakingService;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.PrivateRoomUpdatedPayload;
import com.nitrorush.backend.session.GuestSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

public class PrivateRoomTest {

    private RoomManager roomManager;
    private MatchmakingService matchmakingService;
    private TrackRegistry trackRegistry;
    private TestTimeProvider timeProvider;
    private TestBroadcaster broadcaster;

    private static final String ALLOWED_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    @BeforeEach
    public void setup() {
        trackRegistry = new TrackRegistry();
        timeProvider = new TestTimeProvider();
        broadcaster = new TestBroadcaster();
        roomManager = new RoomManager(trackRegistry, timeProvider, broadcaster);
        matchmakingService = new MatchmakingService(roomManager, timeProvider, broadcaster);
    }

    private GuestSession createGuest(String token, String name) {
        return new GuestSession(token, name, "avatar-1");
    }

    @Test
    @DisplayName("1 & 2. Room creation generates unique 6-character code using valid alphabet")
    public void testCreateRoomGeneratesValidCode() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        assertNotNull(room);
        assertTrue(room.isPrivate());
        String code = room.getRoomCode();
        assertNotNull(code);
        assertEquals(6, code.length(), "Code must be exactly 6 characters");

        for (char c : code.toCharArray()) {
            assertTrue(ALLOWED_ALPHABET.indexOf(c) >= 0, "Character " + c + " not allowed in alphabet");
            assertNotEquals('0', c);
            assertNotEquals('1', c);
            assertNotEquals('I', c);
            assertNotEquals('O', c);
        }

        assertEquals(room.getRoomId(), roomManager.getRoom(room.getRoomId()).orElseThrow().getRoomId());
        assertEquals(room.getRoomId(), roomManager.findRoomByCode(code).orElseThrow().getRoomId());
    }

    @Test
    @DisplayName("3. Collision-free concurrent room code generation")
    public void testConcurrentRoomCodeGeneration() throws Exception {
        int count = 100;
        ExecutorService executor = Executors.newFixedThreadPool(10);
        Set<String> generatedCodes = ConcurrentHashMap.newKeySet();
        CountDownLatch latch = new CountDownLatch(count);

        for (int i = 0; i < count; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    GuestSession guest = createGuest("tok-c-" + idx, "Racer-" + idx);
                    Room r = roomManager.createPrivateRoom("coastal-rush", guest, "bolt-gt", "sess-c-" + idx);
                    generatedCodes.add(r.getRoomCode());
                } finally {
                    latch.countDown();
                }
            });
        }

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        executor.shutdown();

        assertEquals(count, generatedCodes.size(), "All generated room codes must be unique");
    }

    @Test
    @DisplayName("4. Joining with a valid room code succeeds and normalizes input")
    public void testJoinValidRoomCode() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");
        String code = room.getRoomCode();

        GuestSession guest2 = createGuest("tok-p2", "FriendRacer");
        // Test lower-case and whitespace normalization
        Room joined = roomManager.joinPrivateRoom("  " + code.toLowerCase() + "  ", guest2, "viper-r", "sess-p2");

        assertEquals(room.getRoomId(), joined.getRoomId());
        assertEquals(2, joined.getPlayerCount());
        PlayerSlot slot2 = joined.getPlayerSlots().get(1);
        assertEquals("p2", slot2.getPlayerId());
        assertEquals("FriendRacer", slot2.getDisplayName());
        assertEquals("viper-r", slot2.getCarId());
    }

    @Test
    @DisplayName("5. Joining with an invalid or non-existent code fails")
    public void testJoinInvalidCode() {
        GuestSession guest = createGuest("tok-1", "SoloRacer");

        ProtocolException ex1 = assertThrows(ProtocolException.class, () ->
                roomManager.joinPrivateRoom("NONEXI", guest, "bolt-gt", "sess-1"));
        assertEquals(ErrorCode.INVALID_ROOM_CODE, ex1.getErrorCode());

        ProtocolException ex2 = assertThrows(ProtocolException.class, () ->
                roomManager.joinPrivateRoom("", guest, "bolt-gt", "sess-1"));
        assertEquals(ErrorCode.INVALID_ROOM_CODE, ex2.getErrorCode());

        ProtocolException ex3 = assertThrows(ProtocolException.class, () ->
                roomManager.joinPrivateRoom(null, guest, "bolt-gt", "sess-1"));
        assertEquals(ErrorCode.INVALID_ROOM_CODE, ex3.getErrorCode());
    }

    @Test
    @DisplayName("6. Joining a full room (8 players) is rejected with ROOM_FULL")
    public void testJoinFullRoomRejected() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        for (int i = 2; i <= 8; i++) {
            GuestSession p = createGuest("tok-" + i, "Racer-" + i);
            roomManager.joinPrivateRoom(room.getRoomCode(), p, "bolt-gt", "sess-" + i);
        }
        assertEquals(8, room.getPlayerCount());

        GuestSession ninth = createGuest("tok-9", "NinthRacer");
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                roomManager.joinPrivateRoom(room.getRoomCode(), ninth, "bolt-gt", "sess-9"));
        assertEquals(ErrorCode.ROOM_FULL, ex.getErrorCode());
    }

    @Test
    @DisplayName("7. Duplicate room membership is prevented (ALREADY_IN_RACE)")
    public void testDuplicateRoomMembership() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room1 = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        GuestSession guest2 = createGuest("tok-host2", "HostRacer2");
        Room room2 = roomManager.createPrivateRoom("coastal-rush", guest2, "bolt-gt", "sess-host2");

        // Host 1 cannot join room 2 while already in room 1
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                roomManager.joinPrivateRoom(room2.getRoomCode(), host, "bolt-gt", "sess-host-new"));
        assertEquals(ErrorCode.ALREADY_IN_RACE, ex.getErrorCode());
    }

    @Test
    @DisplayName("8. Joining an active race is rejected with ROOM_STATE_INVALID")
    public void testJoinActiveRaceRejected() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        GuestSession p2 = createGuest("tok-p2", "Racer2");
        roomManager.joinPrivateRoom(room.getRoomCode(), p2, "bolt-gt", "sess-p2");

        room.setReady(host.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);
        room.startPrivateRace(host.getGuestToken(), timeProvider.currentTimeMillis());

        assertEquals(RoomState.COUNTDOWN, room.getState());

        GuestSession p3 = createGuest("tok-p3", "LateRacer");
        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                roomManager.joinPrivateRoom(room.getRoomCode(), p3, "bolt-gt", "sess-p3"));
        assertEquals(ErrorCode.ROOM_STATE_INVALID, ex.getErrorCode());
    }

    @Test
    @DisplayName("9. Host ownership is assigned to room creator")
    public void testHostOwnershipAssignedToCreator() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        assertEquals(host.getGuestToken(), room.getHostGuestToken());
        assertEquals("p1", room.getHostPlayerId());

        GuestSession p2 = createGuest("tok-p2", "Racer2");
        roomManager.joinPrivateRoom(room.getRoomCode(), p2, "bolt-gt", "sess-p2");

        // Host remains p1
        assertEquals(host.getGuestToken(), room.getHostGuestToken());
        assertEquals("p1", room.getHostPlayerId());
    }

    @Test
    @DisplayName("10. Non-host cannot start private race (NOT_ROOM_HOST)")
    public void testNonHostCannotStartRace() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        GuestSession p2 = createGuest("tok-p2", "Racer2");
        roomManager.joinPrivateRoom(room.getRoomCode(), p2, "bolt-gt", "sess-p2");

        room.setReady(host.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);

        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                room.startPrivateRace(p2.getGuestToken(), timeProvider.currentTimeMillis()));
        assertEquals(ErrorCode.NOT_ROOM_HOST, ex.getErrorCode());
    }

    @Test
    @DisplayName("11. Host start with <2 players rejected (NOT_ENOUGH_PLAYERS)")
    public void testHostStartWithFewerThanTwoPlayersRejected() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");
        room.setReady(host.getGuestToken(), true);

        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                room.startPrivateRace(host.getGuestToken(), timeProvider.currentTimeMillis()));
        assertEquals(ErrorCode.NOT_ENOUGH_PLAYERS, ex.getErrorCode());
    }

    @Test
    @DisplayName("12. Host start when not all players ready rejected (PLAYERS_NOT_READY)")
    public void testHostStartWhenNotAllReadyRejected() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        GuestSession p2 = createGuest("tok-p2", "Racer2");
        roomManager.joinPrivateRoom(room.getRoomCode(), p2, "bolt-gt", "sess-p2");

        room.setReady(host.getGuestToken(), true);
        // p2 is NOT ready

        ProtocolException ex = assertThrows(ProtocolException.class, () ->
                room.startPrivateRace(host.getGuestToken(), timeProvider.currentTimeMillis()));
        assertEquals(ErrorCode.PLAYERS_NOT_READY, ex.getErrorCode());
    }

    @Test
    @DisplayName("13. Successful host start transitions room to COUNTDOWN with 3s timer and grid")
    public void testSuccessfulHostStart() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        GuestSession p2 = createGuest("tok-p2", "Racer2");
        roomManager.joinPrivateRoom(room.getRoomCode(), p2, "viper-r", "sess-p2");

        room.setReady(host.getGuestToken(), true);
        room.setReady(p2.getGuestToken(), true);

        broadcaster.clear();
        room.startPrivateRace(host.getGuestToken(), timeProvider.currentTimeMillis());

        assertEquals(RoomState.COUNTDOWN, room.getState());
        assertEquals(2, room.getSimulationWorld().getSnapshot().size());

        // Check COUNTDOWN_STARTED broadcast
        assertTrue(broadcaster.events.stream().anyMatch(e -> e.message.getType() == MessageType.COUNTDOWN_STARTED));

        // Advance 3s -> RACING
        timeProvider.advanceMillis(3001);
        room.update(timeProvider.currentTimeMillis());
        assertEquals(RoomState.RACING, room.getState());
        assertTrue(broadcaster.events.stream().anyMatch(e -> e.message.getType() == MessageType.RACE_STARTED));
    }

    @Test
    @DisplayName("14. Host leaves/disconnects: host transfers to earliest connected player")
    public void testHostDisconnectTransfer() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        GuestSession p2 = createGuest("tok-p2", "Racer2");
        roomManager.joinPrivateRoom(room.getRoomCode(), p2, "viper-r", "sess-p2");

        GuestSession p3 = createGuest("tok-p3", "Racer3");
        roomManager.joinPrivateRoom(room.getRoomCode(), p3, "rally-apex", "sess-p3");

        broadcaster.clear();

        // Host leaves
        roomManager.leaveRoom(host.getGuestToken());

        assertEquals(2, room.getPlayerCount());
        assertEquals(p2.getGuestToken(), room.getHostGuestToken());
        assertEquals("p2", room.getHostPlayerId());

        // Verify PRIVATE_ROOM_UPDATED was sent to remaining players with new host
        MessageEnvelope<?> updatedEnvelope = broadcaster.events.stream()
                .filter(e -> e.message.getType() == MessageType.PRIVATE_ROOM_UPDATED)
                .map(e -> e.message)
                .reduce((first, second) -> second)
                .orElseThrow();

        PrivateRoomUpdatedPayload payload = (PrivateRoomUpdatedPayload) updatedEnvelope.getPayload();
        assertEquals("p2", payload.getHostPlayerId());
    }

    @Test
    @DisplayName("15. Last player leaves: room transitions to CLOSED")
    public void testLastPlayerLeavesRoomClosed() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");

        assertEquals(RoomState.WAITING, room.getState());

        roomManager.leaveRoom(host.getGuestToken());

        assertEquals(RoomState.CLOSED, room.getState());
        assertEquals(0, room.getPlayerCount());
    }

    @Test
    @DisplayName("16. Room code removed from manager on room closure (no code leak)")
    public void testRoomCodeCleanedUpOnClosure() {
        GuestSession host = createGuest("tok-host", "HostRacer");
        Room room = roomManager.createPrivateRoom("coastal-rush", host, "bolt-gt", "sess-host");
        String code = room.getRoomCode();

        assertNotNull(roomManager.findRoomByCode(code).orElse(null));

        roomManager.leaveRoom(host.getGuestToken());

        assertEquals(RoomState.CLOSED, room.getState());
        assertTrue(roomManager.findRoomByCode(code).isEmpty(), "Room code must be released when room closes");
    }

    @Test
    @DisplayName("17. Matchmaking isolation: global matchmaking queue never matches into private rooms")
    public void testMatchmakingQueueIsolation() {
        GuestSession privateHost = createGuest("tok-priv", "PrivateHost");
        Room privateRoom = roomManager.createPrivateRoom("coastal-rush", privateHost, "bolt-gt", "sess-priv");
        assertEquals(1, privateRoom.getPlayerCount());

        // 2 players enter global matchmaking queue
        GuestSession mm1 = createGuest("tok-mm1", "MMRacer1");
        GuestSession mm2 = createGuest("tok-mm2", "MMRacer2");

        matchmakingService.joinQueue(mm1, "coastal-rush", "bolt-gt", "sess-mm1");
        matchmakingService.joinQueue(mm2, "coastal-rush", "bolt-gt", "sess-mm2");

        // Advance 15s collection window
        timeProvider.advanceMillis(16000);
        matchmakingService.tick(timeProvider.currentTimeMillis());

        // Private room must remain untouched
        assertEquals(1, privateRoom.getPlayerCount(), "Private room must not receive players from global matchmaking");
        assertEquals(RoomState.WAITING, privateRoom.getState());

        // Global matchmaking should have created a separate room
        Optional<Room> mmRoom1 = roomManager.findRoomByGuestToken(mm1.getGuestToken());
        assertTrue(mmRoom1.isPresent());
        assertNotEquals(privateRoom.getRoomId(), mmRoom1.get().getRoomId(), "MM room must be distinct from private room");
        assertFalse(mmRoom1.get().isPrivate(), "MM room must not be marked private");
    }

    // Helper classes
    static class TestTimeProvider implements TimeProvider {
        private long currentMillis = 1_000_000L;

        @Override public long currentTimeMillis() { return currentMillis; }
        @Override public long nanoTime() { return currentMillis * 1_000_000L; }
        public void advanceMillis(long ms) { currentMillis += ms; }
    }

    static class TestBroadcaster implements MessageBroadcaster {
        final List<BroadcastEvent> events = new CopyOnWriteArrayList<>();
        record BroadcastEvent(String sessionId, MessageEnvelope<?> message) {}

        @Override
        public void sendToSession(String sessionId, MessageEnvelope<?> message) {
            events.add(new BroadcastEvent(sessionId, message));
        }

        @Override
        public void broadcast(String roomId, MessageEnvelope<?> message) {
            events.add(new BroadcastEvent(roomId, message));
        }

        public void clear() {
            events.clear();
        }
    }
}
