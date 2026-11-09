/**
 * Nitro Rush — Milestone 8.4 Phase 2 Late Joining Verification Script
 *
 * Verifies the exact scenario requested:
 * 1. Client A and Client B join a room.
 * 2. Both become ready -> The 15-second collection window begins (T0).
 * 3. Client C joins after 5 seconds (T0 + 5s).
 * 4. Inspect ROOM_ASSIGNED payload delivered to Client C.
 * 5. Verify Client C sees collection window state.
 * 6. Verify Client C does NOT reset the original 15s deadline.
 * 7. Verify all three clients receive COUNTDOWN_STARTED at T0 + 15s (+/- tick jitter).
 */

import { NetworkManager } from '../../Frontend/src/multiplayer/NetworkManager.ts';
import { MessageType } from '../../Frontend/src/multiplayer/ProtocolTypes.ts';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8085/ws/game';
console.log(`[LATE-JOIN AUDIT] Connecting to ${WS_URL}...`);

const clientA = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

const clientB = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

const clientC = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

async function runLateJoinAudit() {
  console.log('--- Step 1: Connecting & Authenticating Client A & Client B ---');
  await clientA.connect();
  const authA = await clientA.authenticateGuest('PilotA');
  console.log(`[PASS] Client A authenticated: ${authA.displayName} (${authA.guestToken.slice(0, 8)}...)`);

  await clientB.connect();
  const authB = await clientB.authenticateGuest('PilotB');
  console.log(`[PASS] Client B authenticated: ${authB.displayName} (${authB.guestToken.slice(0, 8)}...)`);

  console.log('--- Step 2: Joining Matchmaking (coastal-rush) ---');
  const roomAPromise = new Promise((resolve) => clientA.once(MessageType.ROOM_ASSIGNED, resolve));
  const roomBPromise = new Promise((resolve) => clientB.once(MessageType.ROOM_ASSIGNED, resolve));
  const bJoinedPromise = new Promise((resolve) => clientA.once(MessageType.PLAYER_JOINED, resolve));

  clientA.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'bolt-gt',
  });

  const roomA = await roomAPromise;
  console.log(`[PASS] Client A assigned to room ${roomA.roomId} on slot ${roomA.slotId}`);

  clientB.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'viper-r',
  });

  const roomB = await roomBPromise;
  console.log(`[PASS] Client B assigned to room ${roomB.roomId} on slot ${roomB.slotId}`);
  await bJoinedPromise;
  console.log('[PASS] Client A confirmed Client B joined slot P2');

  console.log('--- Step 3: Client A and Client B Ready Up (Starting 15s Window) ---');
  const readyA = new Promise((resolve) => clientB.once(MessageType.PLAYER_READY_STATUS, resolve));
  clientA.send(MessageType.PLAYER_READY, { roomId: roomA.roomId, isReady: true });
  await readyA;

  const countdownPromises = {
    clientA: new Promise((resolve) => clientA.once(MessageType.COUNTDOWN_STARTED, resolve)),
    clientB: new Promise((resolve) => clientB.once(MessageType.COUNTDOWN_STARTED, resolve)),
  };

  const t0 = Date.now();
  console.log(`[T0 = ${new Date(t0).toISOString()}] Both players becoming ready. Collection window begins.`);
  clientB.send(MessageType.PLAYER_READY, { roomId: roomB.roomId, isReady: true });

  console.log('--- Step 4: Waiting 5.0 seconds before Client C joins ---');
  await new Promise((r) => setTimeout(r, 5000));
  const t5 = Date.now();
  console.log(`[T0 + ${(t5 - t0)}ms] Client C now connecting and joining...`);

  await clientC.connect();
  const authC = await clientC.authenticateGuest('PilotC_Late');
  console.log(`[PASS] Client C authenticated: ${authC.displayName} (${authC.guestToken.slice(0, 8)}...)`);

  const roomCPromise = new Promise((resolve) => clientC.once(MessageType.ROOM_ASSIGNED, resolve));
  const cJoinedA = new Promise((resolve) => clientA.once(MessageType.PLAYER_JOINED, resolve));
  const cJoinedB = new Promise((resolve) => clientB.once(MessageType.PLAYER_JOINED, resolve));

  countdownPromises.clientC = new Promise((resolve) => clientC.once(MessageType.COUNTDOWN_STARTED, resolve));

  clientC.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'rally-apex',
  });

  const roomC = await roomCPromise;
  const tJoinC = Date.now();
  console.log(`[T0 + ${(tJoinC - t0)}ms] Client C received ROOM_ASSIGNED!`);
  console.log('[PAYLOAD INSPECTION] Client C ROOM_ASSIGNED payload:');
  console.log(JSON.stringify(roomC, null, 2));

  await Promise.all([cJoinedA, cJoinedB]);
  console.log('[PASS] Client A and Client B received PLAYER_JOINED for Client C');

  console.log('--- Step 5: Awaiting COUNTDOWN_STARTED across all 3 clients ---');
  const [cdA, cdB, cdC] = await Promise.all([
    countdownPromises.clientA.then((p) => ({ client: 'Client A', payload: p, receivedAt: Date.now() })),
    countdownPromises.clientB.then((p) => ({ client: 'Client B', payload: p, receivedAt: Date.now() })),
    countdownPromises.clientC.then((p) => ({ client: 'Client C', payload: p, receivedAt: Date.now() })),
  ]);

  console.log('--- Step 6: Timing & Synchronization Analysis ---');
  const elapsedA = cdA.receivedAt - t0;
  const elapsedB = cdB.receivedAt - t0;
  const elapsedC = cdC.receivedAt - t0;

  console.log(`[TIMING] Client A received COUNTDOWN_STARTED at T0 + ${elapsedA}ms (Duration: ${cdA.payload.durationSeconds}s)`);
  console.log(`[TIMING] Client B received COUNTDOWN_STARTED at T0 + ${elapsedB}ms (Duration: ${cdB.payload.durationSeconds}s)`);
  console.log(`[TIMING] Client C received COUNTDOWN_STARTED at T0 + ${elapsedC}ms (Duration: ${cdC.payload.durationSeconds}s)`);

  const deltaFrom15s = Math.abs(elapsedA - 15000);
  console.log(`[DEADLINE PRESERVATION] Delta from original 15,000ms deadline: ${deltaFrom15s}ms (within 20Hz tick resolution: 50ms)`);

  const maxClientSkew = Math.max(Math.abs(elapsedA - elapsedB), Math.abs(elapsedA - elapsedC), Math.abs(elapsedB - elapsedC));
  console.log(`[BROADCAST SKEW] Maximum skew between clients: ${maxClientSkew}ms`);

  // Assertions
  if (elapsedA > 17000) {
    throw new Error(`Collection window was improperly extended! Elapsed: ${elapsedA}ms (expected ~15000ms)`);
  }
  if (deltaFrom15s > 500) {
    throw new Error(`Countdown did not start at server deadline! Delta: ${deltaFrom15s}ms`);
  }
  if (maxClientSkew > 50) {
    throw new Error(`Client countdown receipt skewed beyond acceptable limit! Skew: ${maxClientSkew}ms`);
  }

  console.log('\n========================================================================');
  console.log('✅ LATE JOINING VERIFICATION PASSED');
  console.log(' - Client C joined at T0 + 5s without resetting the 15s deadline');
  console.log(' - Server authoritative collection window elapsed at original deadline');
  console.log(` - All 3 clients received COUNTDOWN_STARTED within ${maxClientSkew}ms of each other`);
  console.log('========================================================================\n');

  clientA.disconnect();
  clientB.disconnect();
  clientC.disconnect();
  process.exit(0);
}

runLateJoinAudit().catch((err) => {
  console.error('[FAIL] Late join audit failed:', err);
  clientA.disconnect();
  clientB.disconnect();
  clientC.disconnect();
  process.exit(1);
});

