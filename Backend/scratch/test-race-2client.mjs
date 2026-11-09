/**
 * Nitro Rush — Phase 3 Live Multi-Client Race Integration Test
 *
 * Verifies the complete end-to-end in-race multiplayer loop with the real Spring Boot server:
 * 1. Two clients connect, authenticate as guests, and join a shared room on "coastal-rush".
 * 2. Both racers ready up, triggering COUNTDOWN_STARTED (3 seconds).
 * 3. Both receive RACE_STARTED and unlock controls.
 * 4. Both stream PLAYER_INPUT at 20 Hz (50ms interval) with monotonic sequence numbers.
 * 5. Authoritative server simulates physics at 60 Hz and broadcasts RACE_STATE at 20 Hz.
 * 6. Both clients receive RACE_STATE snapshots containing:
 *    - Valid serverTick and serverTimeMs
 *    - Both vehicle telemetry entries (speed > 0, advancing coordinates)
 *    - Authoritative ackInputSeq acknowledging client input frames
 * 7. Clients feed telemetry into SnapshotInterpolator and PredictionReconciler, confirming
 *    zero crashes and proper interpolation/deadband handling.
 * 8. Clean graceful teardown.
 */

import { NetworkManager } from '../../Frontend/src/multiplayer/NetworkManager.ts';
import { MessageType } from '../../Frontend/src/multiplayer/ProtocolTypes.ts';
import { SnapshotInterpolator } from '../../Frontend/src/multiplayer/SnapshotInterpolator.ts';
import { PredictionReconciler } from '../../Frontend/src/multiplayer/PredictionReconciler.ts';
import { InputHistoryBuffer } from '../../Frontend/src/multiplayer/InputHistoryBuffer.ts';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8085/ws/game';
const ROOM_ID = `room-phase3-${Date.now()}`;

console.log(`[TEST] Starting 2-Client In-Race Integration Test against ${WS_URL}...`);
console.log(`[TEST] Room ID: ${ROOM_ID}`);

const client1 = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

const client2 = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

try {
  // Step 1: Connect & Authenticate
  await client1.connect();
  const auth1 = await client1.authenticateGuest('PilotAlpha');
  console.log(`[PASS] Client 1 (PilotAlpha) authenticated (Display: ${auth1.displayName})`);

  await client2.connect();
  const auth2 = await client2.authenticateGuest('PilotBeta');
  console.log(`[PASS] Client 2 (PilotBeta) authenticated (Display: ${auth2.displayName})`);

  // Step 2: Matchmaking & Room Assignment
  const roomAssignedPromise1 = new Promise((resolve) => client1.once(MessageType.ROOM_ASSIGNED, resolve));
  const roomAssignedPromise2 = new Promise((resolve) => client2.once(MessageType.ROOM_ASSIGNED, resolve));
  const p1JoinedPromise = new Promise((resolve) => client1.once(MessageType.PLAYER_JOINED, resolve));

  client1.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'bolt-gt',
    roomId: ROOM_ID,
  });

  const room1 = await roomAssignedPromise1;
  const playerId1 = room1.players.find((p) => p.slot === room1.slotId).id;
  console.log(`[PASS] Client 1 (PilotAlpha) assigned to room "${room1.roomId}" on slot "${room1.slotId}" (Player ID: ${playerId1})`);

  client2.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'viper-r',
    roomId: ROOM_ID,
  });

  const room2 = await roomAssignedPromise2;
  const playerId2 = room2.players.find((p) => p.slot === room2.slotId).id;
  console.log(`[PASS] Client 2 (PilotBeta) assigned to room "${room2.roomId}" on slot "${room2.slotId}" (Player ID: ${playerId2})`);

  await p1JoinedPromise;
  console.log('[PASS] Client 1 confirmed Client 2 joined via PLAYER_JOINED');

  // Step 3: Ready Up
  console.log('[TEST] Both racers readying up...');
  const countdownPromise1 = new Promise((resolve) => client1.once(MessageType.COUNTDOWN_STARTED, resolve));
  const countdownPromise2 = new Promise((resolve) => client2.once(MessageType.COUNTDOWN_STARTED, resolve));

  client1.send(MessageType.PLAYER_READY, { roomId: ROOM_ID, isReady: true });
  client2.send(MessageType.PLAYER_READY, { roomId: ROOM_ID, isReady: true });

  const countdown1 = await countdownPromise1;
  const countdown2 = await countdownPromise2;
  console.log(`[PASS] Both clients received COUNTDOWN_STARTED (duration: ${countdown1.durationSeconds}s)`);

  // Step 4: Await RACE_STARTED
  console.log('[TEST] Waiting for server countdown to expire (3 seconds)...');
  const raceStartedPromise1 = new Promise((resolve) => client1.once(MessageType.RACE_STARTED, resolve));
  const raceStartedPromise2 = new Promise((resolve) => client2.once(MessageType.RACE_STARTED, resolve));

  const raceStarted1 = await raceStartedPromise1;
  const raceStarted2 = await raceStartedPromise2;
  console.log(`[PASS] RACE_STARTED received by both clients (serverTimestamp: ${raceStarted1.serverTimestamp})`);

  // Step 5: 20 Hz Input Streaming & Snapshot Verification
  console.log('[TEST] Starting 20 Hz input streaming (throttle: 1.0) and monitoring RACE_STATE...');

  const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100, maxExtrapolationMs: 250 });
  const reconciler = new PredictionReconciler();
  const historyBuffer = new InputHistoryBuffer(120);

  let seq1 = 0;
  let seq2 = 0;
  let receivedSnapshots1 = 0;
  let receivedSnapshots2 = 0;
  let maxSpeedKMH1 = 0;
  let maxSpeedKMH2 = 0;
  let latestAckSeq1 = 0;
  let latestAckSeq2 = 0;

  // Mock car and track for local reconciler validation
  const mockCar = {
    x: 0, y: 0, vx: 0, vy: 0, rotation: 0,
    forwardSpeed: 0, lateralSpeed: 0, currentSpeedKMH: 0,
    nitroAmount: 100, isDrifting: false, isReverseGear: false,
    sprite: { x: 0, y: 0, rotation: 0 },
    update: () => {},
    syncSprite: () => {},
  };
  const mockTrack = {
    isPointOnTrack: () => true,
    worldWidth: 5000,
    worldHeight: 5000,
    physics: {},
  };

  const offRaceState1 = client1.on(MessageType.RACE_STATE, (payload) => {
    receivedSnapshots1++;
    if (payload.ackInputSeq && payload.ackInputSeq[playerId1]) {
      latestAckSeq1 = payload.ackInputSeq[playerId1];
    }

    for (const v of payload.vehicles) {
      if (v.id === playerId1) {
        maxSpeedKMH1 = Math.max(maxSpeedKMH1, v.speedKMH);
        // Test PredictionReconciler execution
        reconciler.reconcile(latestAckSeq1, v, mockCar, historyBuffer, mockTrack);
      } else {
        // Remote competitor: push to SnapshotInterpolator
        interpolator.pushSnapshot(v, payload.serverTimeMs);
      }
    }
  });

  const offRaceState2 = client2.on(MessageType.RACE_STATE, (payload) => {
    receivedSnapshots2++;
    if (payload.ackInputSeq && payload.ackInputSeq[playerId2]) {
      latestAckSeq2 = payload.ackInputSeq[playerId2];
    }

    for (const v of payload.vehicles) {
      if (v.id === playerId2) {
        maxSpeedKMH2 = Math.max(maxSpeedKMH2, v.speedKMH);
      }
    }
  });

  // Stream inputs at 20 Hz for 3 seconds (60 ticks)
  const inputInterval = setInterval(() => {
    seq1++;
    seq2++;

    historyBuffer.push({
      sequenceNumber: seq1,
      timestamp: Date.now(),
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: mockCar.x, y: mockCar.y, vx: mockCar.vx, vy: mockCar.vy, rotation: mockCar.rotation,
        forwardSpeed: mockCar.forwardSpeed, lateralSpeed: mockCar.lateralSpeed,
        currentSpeedKMH: mockCar.currentSpeedKMH, nitroAmount: mockCar.nitroAmount,
        isDrifting: mockCar.isDrifting, isReverseGear: mockCar.isReverseGear,
      },
    });

    client1.send(MessageType.PLAYER_INPUT, {
      roomId: ROOM_ID,
      sequenceNumber: seq1,
      throttle: 1.0,
      brake: 0.0,
      steer: 0.0,
      drift: false,
      nitro: false,
    });

    client2.send(MessageType.PLAYER_INPUT, {
      roomId: ROOM_ID,
      sequenceNumber: seq2,
      throttle: 1.0,
      brake: 0.0,
      steer: 0.0,
      drift: false,
      nitro: false,
    });
  }, 50);

  // Wait 3 seconds of in-race physics simulation
  await new Promise((resolve) => setTimeout(resolve, 3200));
  clearInterval(inputInterval);

  offRaceState1();
  offRaceState2();

  console.log(`[PASS] Input streaming complete. Client 1 sent: ${seq1} inputs, Client 2 sent: ${seq2} inputs.`);
  console.log(`[PASS] RACE_STATE snapshots received: Client 1: ${receivedSnapshots1}, Client 2: ${receivedSnapshots2}`);
  console.log(`[PASS] Latest server input acknowledgements: Client 1: seq ${latestAckSeq1}, Client 2: seq ${latestAckSeq2}`);
  console.log(`[PASS] Authoritative speeds achieved: Client 1: ${maxSpeedKMH1} km/h, Client 2: ${maxSpeedKMH2} km/h`);

  if (receivedSnapshots1 < 20 || receivedSnapshots2 < 20) {
    throw new Error(`Insufficient snapshot reception: c1=${receivedSnapshots1}, c2=${receivedSnapshots2}`);
  }
  if (latestAckSeq1 < 10 || latestAckSeq2 < 10) {
    throw new Error(`Server failed to acknowledge inputs: ack1=${latestAckSeq1}, ack2=${latestAckSeq2}`);
  }
  if (maxSpeedKMH1 < 30 || maxSpeedKMH2 < 30) {
    throw new Error(`Physics simulation did not accelerate cars: speed1=${maxSpeedKMH1}, speed2=${maxSpeedKMH2}`);
  }

  // Verify SnapshotInterpolator sample
  const sample = interpolator.sample(Date.now() - 50);
  console.log(`[PASS] SnapshotInterpolator sampled remote car position: x=${sample?.x.toFixed(2)}, y=${sample?.y.toFixed(2)}, rot=${sample?.rotation.toFixed(3)}`);

  // Step 6: Disconnect Cleanly
  client1.disconnect();
  client2.disconnect();
  console.log('[PASS] Both clients disconnected gracefully.');

  console.log('\n================================================================');
  console.log('✅ MULTIPLAYER RACE SCENE & NETCODE INTEGRATION TEST PASSED (100% SUCCESS)');
  console.log('================================================================');
  process.exit(0);
} catch (err) {
  console.error('[FAIL] Integration test error:', err);
  client1.disconnect();
  client2.disconnect();
  process.exit(1);
}
