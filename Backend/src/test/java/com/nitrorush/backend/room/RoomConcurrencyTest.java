package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TestTimeProvider;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.session.GuestSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.3: Concurrency & Stress Tests")
public class RoomConcurrencyTest {

    private TrackDefinition track;
    private TestTimeProvider timeProvider;
    private RoomManager roomManager;

    @BeforeEach
    public void setup() {
        track = TrackRegistry.getStatic("coastal-rush");
        timeProvider = new TestTimeProvider(1000000L);
        roomManager = new RoomManager(new TrackRegistry(), timeProvider, new Room.NoopMessageBroadcaster());
    }

    @Test
    @DisplayName("Simultaneous joins: 64 concurrent threads race to join 1 room; exactly 8 succeed, 56 fail with ROOM_FULL")
    public void testSimultaneousJoinsCapacityLimit() throws Exception {
        Room room = roomManager.createRoom("coastal-rush");
        int threadCount = 64;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate = new CountDownLatch(threadCount);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger fullCount = new AtomicInteger(0);
        List<Throwable> unexpectedErrors = new CopyOnWriteArrayList<>();

        for (int i = 0; i < threadCount; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    startGate.await();
                    GuestSession guest = new GuestSession(UUID.randomUUID().toString(), "Racer_" + idx, "av");
                    room.join(guest, "bolt-gt", "sess-" + idx);
                    successCount.incrementAndGet();
                } catch (ProtocolException pe) {
                    if (pe.getErrorCode() == ErrorCode.ROOM_FULL || pe.getErrorCode() == ErrorCode.ROOM_STATE_INVALID) {
                        fullCount.incrementAndGet();
                    } else {
                        unexpectedErrors.add(pe);
                    }
                } catch (Throwable t) {
                    unexpectedErrors.add(t);
                } finally {
                    endGate.countDown();
                }
            });
        }

        startGate.countDown();
        assertTrue(endGate.await(10, TimeUnit.SECONDS), "Concurrent join threads timed out");
        executor.shutdown();

        assertTrue(unexpectedErrors.isEmpty(), "Unexpected errors during concurrent joins: " + unexpectedErrors);
        assertEquals(Room.MAX_PLAYERS, successCount.get(), "Exactly 8 players must successfully occupy room slots");
        assertEquals(56, fullCount.get(), "Exactly 56 threads must receive ROOM_FULL");
        assertEquals(Room.MAX_PLAYERS, room.getPlayerCount());
    }

    @Test
    @DisplayName("Simultaneous ready toggles by 8 racers execute deterministically without race condition")
    public void testSimultaneousReadyToggles() throws Exception {
        Room room = roomManager.createRoom("coastal-rush");
        List<GuestSession> guests = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            GuestSession g = new GuestSession(UUID.randomUUID().toString(), "Racer_" + i, "av");
            guests.add(g);
            room.join(g, "bolt-gt", "sess-" + i);
        }

        ExecutorService executor = Executors.newFixedThreadPool(8);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate = new CountDownLatch(8);

        for (GuestSession g : guests) {
            executor.submit(() -> {
                try {
                    startGate.await();
                    room.setReady(g.getGuestToken(), true);
                } catch (Exception ignored) {
                } finally {
                    endGate.countDown();
                }
            });
        }

        startGate.countDown();
        assertTrue(endGate.await(5, TimeUnit.SECONDS));
        executor.shutdown();

        // All 8 must be ready and room must have cleanly transitioned to COUNTDOWN
        assertEquals(RoomState.COUNTDOWN, room.getState());
        for (PlayerSlot slot : room.getPlayerSlots()) {
            assertTrue(slot.isReady());
        }
    }

    @Test
    @DisplayName("Concurrent room creation across 32 threads allocates unique rooms without collisions")
    public void testConcurrentRoomCreation() throws Exception {
        int threadCount = 32;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate = new CountDownLatch(threadCount);

        ConcurrentHashMap<String, Room> createdRooms = new ConcurrentHashMap<>();

        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                try {
                    startGate.await();
                    Room r = roomManager.createRoom("mountain-pass");
                    createdRooms.put(r.getRoomId(), r);
                } catch (Exception ignored) {
                } finally {
                    endGate.countDown();
                }
            });
        }

        startGate.countDown();
        assertTrue(endGate.await(5, TimeUnit.SECONDS));
        executor.shutdown();

        assertEquals(threadCount, createdRooms.size(), "All 32 rooms must have unique room IDs");
        assertEquals(threadCount, roomManager.getActiveRoomCount());
    }
}
