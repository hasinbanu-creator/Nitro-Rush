package com.nitrorush.backend.matchmaking;

import com.nitrorush.backend.common.TimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.MatchmakingStatusPayload;
import com.nitrorush.backend.room.MessageBroadcaster;
import com.nitrorush.backend.room.PlayerSlot;
import com.nitrorush.backend.room.Room;
import com.nitrorush.backend.room.RoomManager;
import com.nitrorush.backend.session.GuestSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.5 — MatchmakingService Authoritative Queue Unit Tests")
class MatchmakingServiceTest {

    private TestTimeProvider timeProvider;
    private TestBroadcaster broadcaster;
    private RoomManager roomManager;
    private MatchmakingService matchmakingService;

    @BeforeEach
    void setUp() {
        timeProvider = new TestTimeProvider();
        broadcaster = new TestBroadcaster();
        TrackRegistry trackRegistry = new TrackRegistry();
        roomManager = new RoomManager(trackRegistry, timeProvider, broadcaster);
        matchmakingService = new MatchmakingService(roomManager, timeProvider, broadcaster);
    }

    private GuestSession createGuest(String token, String name) {
        return new GuestSession(token, name, "avatar-1");
    }

    @Test
    @DisplayName("1. One player waiting in queue receives QUEUED status with position 1")
    void testOnePlayerWaiting() {
        GuestSession guest1 = createGuest("tok-1", "Racer1");
        matchmakingService.joinQueue(guest1, "coastal-rush", "bolt-gt", "sess-1");

        assertEquals(1, matchmakingService.getQueueSize());
        assertEquals(0L, matchmakingService.getCollectionDeadlineMs(), "Collection window must not start for 1 player");

        List<MessageEnvelope<?>> messages = broadcaster.getMessagesForSession("sess-1");
        assertFalse(messages.isEmpty());
        MessageEnvelope<?> latest = messages.get(messages.size() - 1);
        assertEquals(MessageType.MATCHMAKING_STATUS, latest.getType());

        MatchmakingStatusPayload status = (MatchmakingStatusPayload) latest.getPayload();
        assertEquals(MatchmakingService.STATUS_QUEUED, status.getStatus());
        assertEquals(1, status.getPosition());
        assertEquals(1, status.getTotalWaiting());
        assertEquals(0, status.getCollectionTimeRemainingSec());
    }

    @Test
    @DisplayName("2. Two players trigger the 15-second collection window")
    void testTwoPlayersTriggerCollectionWindow() {
        GuestSession guest1 = createGuest("tok-1", "Racer1");
        GuestSession guest2 = createGuest("tok-2", "Racer2");

        matchmakingService.joinQueue(guest1, "coastal-rush", "bolt-gt", "sess-1");
        long joinTime = timeProvider.currentTimeMillis();
        matchmakingService.joinQueue(guest2, "coastal-rush", "viper-r", "sess-2");

        assertEquals(2, matchmakingService.getQueueSize());
        assertEquals(joinTime + 15_000L, matchmakingService.getCollectionDeadlineMs());

        // Verify status sent to both players
        MatchmakingStatusPayload status1 = broadcaster.getLatestStatus("sess-1");
        assertNotNull(status1);
        assertEquals(MatchmakingService.STATUS_COLLECTION_WINDOW, status1.getStatus());
        assertEquals(1, status1.getPosition());
        assertEquals(2, status1.getTotalWaiting());
        assertEquals(15, status1.getCollectionTimeRemainingSec());

        MatchmakingStatusPayload status2 = broadcaster.getLatestStatus("sess-2");
        assertNotNull(status2);
        assertEquals(MatchmakingService.STATUS_COLLECTION_WINDOW, status2.getStatus());
        assertEquals(2, status2.getPosition());
        assertEquals(2, status2.getTotalWaiting());
        assertEquals(15, status2.getCollectionTimeRemainingSec());
    }

    @Test
    @DisplayName("3. Additional players joining during collection window are appended in FIFO order")
    void testAdditionalPlayersJoiningDuringWindow() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        GuestSession g2 = createGuest("tok-2", "Racer2");
        GuestSession g3 = createGuest("tok-3", "Racer3");
        GuestSession g4 = createGuest("tok-4", "Racer4");

        matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1");
        matchmakingService.joinQueue(g2, "coastal-rush", "bolt-gt", "sess-2");
        matchmakingService.joinQueue(g3, "coastal-rush", "bolt-gt", "sess-3");
        matchmakingService.joinQueue(g4, "coastal-rush", "bolt-gt", "sess-4");

        assertEquals(4, matchmakingService.getQueueSize());

        MatchmakingStatusPayload s3 = broadcaster.getLatestStatus("sess-3");
        assertEquals(3, s3.getPosition());
        assertEquals(4, s3.getTotalWaiting());

        MatchmakingStatusPayload s4 = broadcaster.getLatestStatus("sess-4");
        assertEquals(4, s4.getPosition());
        assertEquals(4, s4.getTotalWaiting());
    }

    @Test
    @DisplayName("4. Collection deadline does NOT reset when new players join")
    void testCollectionDeadlineNotResetting() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        GuestSession g2 = createGuest("tok-2", "Racer2");
        GuestSession g3 = createGuest("tok-3", "Racer3");

        long startTime = timeProvider.currentTimeMillis();
        matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1");
        matchmakingService.joinQueue(g2, "coastal-rush", "bolt-gt", "sess-2");

        long initialDeadline = matchmakingService.getCollectionDeadlineMs();
        assertEquals(startTime + 15_000L, initialDeadline);

        // Advance 5 seconds
        timeProvider.advanceMillis(5_000L);

        // 3rd player joins
        matchmakingService.joinQueue(g3, "coastal-rush", "bolt-gt", "sess-3");

        // Deadline must be unchanged!
        assertEquals(initialDeadline, matchmakingService.getCollectionDeadlineMs(),
                "Collection deadline must not reset when a new player joins");

        MatchmakingStatusPayload s3 = broadcaster.getLatestStatus("sess-3");
        assertEquals(10, s3.getCollectionTimeRemainingSec(), "Remaining collection time must reflect elapsed time (10s)");
    }

    @Test
    @DisplayName("5. Eight players trigger immediate room creation without waiting for deadline")
    void testEightPlayersTriggerImmediateRoomCreation() {
        for (int i = 1; i <= 8; i++) {
            GuestSession g = createGuest("tok-" + i, "Racer" + i);
            matchmakingService.joinQueue(g, "coastal-rush", "bolt-gt", "sess-" + i);
        }

        // Queue should be cleared because match formed immediately
        assertEquals(0, matchmakingService.getQueueSize());
        assertEquals(0L, matchmakingService.getCollectionDeadlineMs());
        assertEquals(1, roomManager.getActiveRoomCount());

        Room createdRoom = roomManager.getAllRooms().iterator().next();
        assertEquals(8, createdRoom.getPlayerCount());

        // Verify all 8 players received ROOM_ASSIGNED
        for (int i = 1; i <= 8; i++) {
            List<MessageEnvelope<?>> msgs = broadcaster.getMessagesForSession("sess-" + i);
            boolean gotRoomAssigned = msgs.stream().anyMatch(m -> m.getType() == MessageType.ROOM_ASSIGNED);
            assertTrue(gotRoomAssigned, "Player sess-" + i + " must have received ROOM_ASSIGNED");
        }
    }

    @Test
    @DisplayName("6. Collection window expiration matches available players (2 to 7)")
    void testCollectionWindowExpirationMatchesAvailable() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        GuestSession g2 = createGuest("tok-2", "Racer2");
        GuestSession g3 = createGuest("tok-3", "Racer3");

        matchmakingService.joinQueue(g1, "desert-heat", "bolt-gt", "sess-1");
        matchmakingService.joinQueue(g2, "desert-heat", "bolt-gt", "sess-2");
        matchmakingService.joinQueue(g3, "desert-heat", "bolt-gt", "sess-3");

        assertEquals(3, matchmakingService.getQueueSize());
        assertEquals(0, roomManager.getActiveRoomCount());

        // Advance past 15-second collection deadline
        timeProvider.advanceMillis(15_100L);
        matchmakingService.tick(timeProvider.currentTimeMillis());

        // Room should now be created with the 3 players
        assertEquals(0, matchmakingService.getQueueSize());
        assertEquals(1, roomManager.getActiveRoomCount());

        Room room = roomManager.getAllRooms().iterator().next();
        assertEquals(3, room.getPlayerCount());
        assertEquals("desert-heat", room.getTrack().getId());
    }

    @Test
    @DisplayName("7. FIFO ordering assigns slot P1 to first queued player, P2 to second, etc.")
    void testFifoOrdering() {
        GuestSession g1 = createGuest("tok-A", "Alice");
        GuestSession g2 = createGuest("tok-B", "Bob");
        GuestSession g3 = createGuest("tok-C", "Charlie");

        matchmakingService.joinQueue(g1, "forest-trail", "bolt-gt", "sess-A");
        matchmakingService.joinQueue(g2, "forest-trail", "viper-r", "sess-B");
        matchmakingService.joinQueue(g3, "forest-trail", "rally-apex", "sess-C");

        // Expire window
        timeProvider.advanceMillis(15_000L);
        matchmakingService.tick(timeProvider.currentTimeMillis());

        Room room = roomManager.getAllRooms().iterator().next();
        List<PlayerSlot> slots = room.getPlayerSlots();

        assertEquals(3, slots.size());
        assertEquals("tok-A", slots.get(0).getGuestToken());
        assertEquals("P1", slots.get(0).getSlotId());
        assertEquals("tok-B", slots.get(1).getGuestToken());
        assertEquals("P2", slots.get(1).getSlotId());
        assertEquals("tok-C", slots.get(2).getGuestToken());
        assertEquals("P3", slots.get(2).getSlotId());
    }

    @Test
    @DisplayName("8. Queue cancellation removes player and cancels collection window if count drops below 2")
    void testQueueCancellation() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        GuestSession g2 = createGuest("tok-2", "Racer2");

        matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1");
        matchmakingService.joinQueue(g2, "coastal-rush", "bolt-gt", "sess-2");
        assertTrue(matchmakingService.getCollectionDeadlineMs() > 0);

        // Player 2 cancels
        matchmakingService.cancelQueue("tok-2");

        assertFalse(matchmakingService.isQueued("tok-2"));
        assertEquals(1, matchmakingService.getQueueSize());
        assertEquals(0L, matchmakingService.getCollectionDeadlineMs(), "Collection window must be cancelled when count < 2");

        // Player 2 received CANCELLED
        MatchmakingStatusPayload s2 = broadcaster.getLatestStatus("sess-2");
        assertEquals(MatchmakingService.STATUS_CANCELLED, s2.getStatus());

        // Player 1 received updated QUEUED status
        MatchmakingStatusPayload s1 = broadcaster.getLatestStatus("sess-1");
        assertEquals(MatchmakingService.STATUS_QUEUED, s1.getStatus());
        assertEquals(1, s1.getTotalWaiting());
        assertEquals(0, s1.getCollectionTimeRemainingSec());
    }

    @Test
    @DisplayName("9. Player disconnect during matchmaking removes player and updates remaining")
    void testPlayerDisconnectDuringMatchmaking() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        GuestSession g2 = createGuest("tok-2", "Racer2");

        matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1");
        matchmakingService.joinQueue(g2, "coastal-rush", "bolt-gt", "sess-2");

        // Disconnect session 1
        matchmakingService.handleDisconnect("sess-1", "tok-1");

        assertFalse(matchmakingService.isQueued("tok-1"));
        assertEquals(1, matchmakingService.getQueueSize());
        assertEquals(0L, matchmakingService.getCollectionDeadlineMs());

        MatchmakingStatusPayload s2 = broadcaster.getLatestStatus("sess-2");
        assertEquals(MatchmakingService.STATUS_QUEUED, s2.getStatus());
        assertEquals(1, s2.getPosition());
        assertEquals(1, s2.getTotalWaiting());
    }

    @Test
    @DisplayName("10. Duplicate queue requests are rejected with ALREADY_IN_QUEUE")
    void testDuplicateQueueRequests() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1");

        // Attempting to join again with same guestToken
        ProtocolException pe1 = assertThrows(ProtocolException.class, () ->
                matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1-dup"));
        assertEquals(ErrorCode.ALREADY_IN_QUEUE, pe1.getErrorCode());

        // Attempting to join with different guestToken but same sessionId
        GuestSession g2 = createGuest("tok-2", "Racer2");
        ProtocolException pe2 = assertThrows(ProtocolException.class, () ->
                matchmakingService.joinQueue(g2, "coastal-rush", "bolt-gt", "sess-1"));
        assertEquals(ErrorCode.ALREADY_IN_QUEUE, pe2.getErrorCode());
    }

    @Test
    @DisplayName("11. Player already assigned to an active room cannot join queue (ALREADY_IN_RACE)")
    void testPlayerAttemptingToJoinMultipleRooms() {
        GuestSession g1 = createGuest("tok-1", "Racer1");
        Room room = roomManager.createRoom("coastal-rush");
        roomManager.joinRoom(room.getRoomId(), g1, "bolt-gt", "sess-1");

        ProtocolException pe = assertThrows(ProtocolException.class, () ->
                matchmakingService.joinQueue(g1, "coastal-rush", "bolt-gt", "sess-1"));
        assertEquals(ErrorCode.ALREADY_IN_RACE, pe.getErrorCode());
    }

    @Test
    @DisplayName("12. Cancelling when not in queue throws NOT_IN_QUEUE")
    void testCancelWhenNotInQueue() {
        ProtocolException pe = assertThrows(ProtocolException.class, () ->
                matchmakingService.cancelQueue("non-existent-token"));
        assertEquals(ErrorCode.NOT_IN_QUEUE, pe.getErrorCode());
    }

    @Test
    @DisplayName("13. Concurrent queue joins are completely thread-safe without race conditions")
    void testConcurrentQueueJoins() throws InterruptedException {
        int threadCount = 20;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        AtomicInteger successCount = new AtomicInteger(0);

        for (int i = 0; i < threadCount; i++) {
            final int index = i;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    GuestSession g = createGuest("tok-concurrent-" + index, "Racer_" + index);
                    matchmakingService.joinQueue(g, "coastal-rush", "bolt-gt", "sess-concurrent-" + index);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    // unexpected
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        assertTrue(doneLatch.await(5, TimeUnit.SECONDS));
        executor.shutdown();

        assertEquals(threadCount, successCount.get());

        // 20 players: 8 + 8 = 16 matched into 2 rooms, 4 remaining in queue
        assertEquals(2, roomManager.getActiveRoomCount());
        assertEquals(4, matchmakingService.getQueueSize());
    }

    @Test
    @DisplayName("14. Room assignment correctness: created room has correct track, slots, and total laps")
    void testRoomAssignmentCorrectness() {
        GuestSession g1 = createGuest("tok-1", "FastRacer");
        GuestSession g2 = createGuest("tok-2", "TurboRacer");

        matchmakingService.joinQueue(g1, "volcano-run", "viper-r", "sess-1");
        matchmakingService.joinQueue(g2, "volcano-run", "rally-apex", "sess-2");

        // Fast forward collection deadline
        timeProvider.advanceMillis(15_000L);
        matchmakingService.tick(timeProvider.currentTimeMillis());

        assertEquals(1, roomManager.getActiveRoomCount());
        Room room = roomManager.getAllRooms().iterator().next();

        assertEquals("volcano-run", room.getTrack().getId());
        assertEquals(3, Room.TOTAL_LAPS);
        assertEquals(2, room.getPlayerCount());

        PlayerSlot slot1 = room.getPlayerSlots().stream()
                .filter(s -> "tok-1".equals(s.getGuestToken())).findFirst().orElseThrow();
        assertEquals("P1", slot1.getSlotId());
        assertEquals("FastRacer", slot1.getDisplayName());
        assertEquals("viper-r", slot1.getCarId());

        PlayerSlot slot2 = room.getPlayerSlots().stream()
                .filter(s -> "tok-2".equals(s.getGuestToken())).findFirst().orElseThrow();
        assertEquals("P2", slot2.getSlotId());
        assertEquals("TurboRacer", slot2.getDisplayName());
        assertEquals("rally-apex", slot2.getCarId());
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
        public void broadcast(String roomId, MessageEnvelope<?> message) {}

        public List<MessageEnvelope<?>> getMessagesForSession(String sessionId) {
            List<MessageEnvelope<?>> list = new ArrayList<>();
            for (BroadcastEvent e : events) {
                if (Objects.equals(e.sessionId(), sessionId)) {
                    list.add(e.message());
                }
            }
            return list;
        }

        public MatchmakingStatusPayload getLatestStatus(String sessionId) {
            return events.stream()
                    .filter(e -> Objects.equals(e.sessionId(), sessionId) && e.message().getType() == MessageType.MATCHMAKING_STATUS)
                    .map(e -> (MatchmakingStatusPayload) e.message().getPayload())
                    .reduce((first, second) -> second)
                    .orElse(null);
        }
    }
}
