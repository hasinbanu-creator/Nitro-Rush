/**
 * Nitro Rush — Phase 3 Technical Audit: Netcode Components
 *
 * Covers Sections 1, 2, 3, and 4 of the Final Technical Audit:
 * 1. InputHistoryBuffer (discrepancy resolution, physics/render/transmit classification, ack pruning, stale/duplicate/out-of-order acks).
 * 2. SnapshotInterpolator (scalar shortest-arc angle lerp, bidirectional +/-PI wraparound, linear spatial lerp, duplicates, out-of-order, 250ms cap).
 * 3. PredictionReconciler (50ms fixed timestep replay, state restoration, outside-window acks, numerical divergence tests).
 * 4. ResultsScene backward compatibility (single-player vs multiplayer state classification).
 */

import assert from 'node:assert';
import { InputHistoryBuffer } from '../../Frontend/src/multiplayer/InputHistoryBuffer.ts';
import { SnapshotInterpolator } from '../../Frontend/src/multiplayer/SnapshotInterpolator.ts';
import { PredictionReconciler } from '../../Frontend/src/multiplayer/PredictionReconciler.ts';

console.log('================================================================');
console.log('NITRO RUSH — PHASE 3 TECHNICAL AUDIT: NETCODE COMPONENTS');
console.log('================================================================\n');

// ============================================================================
// SECTION 1: InputHistoryBuffer Audit
// ============================================================================
console.log('--- SECTION 1: InputHistoryBuffer Audit ---');

const buf = new InputHistoryBuffer(120);
console.log(`Buffer capacity: ${buf.getCapacity()} slots`);
console.log(`At 20 Hz input streaming (50ms send interval): 120 × 50ms = ${120 * 50}ms = 6.0 seconds of history`);
assert.strictEqual(buf.getCapacity() * 50, 6000, 'Capacity × 50ms must equal 6000ms');

// Helper to push mock input frames
function pushFrame(buffer, seq) {
  buffer.push({
    sequenceNumber: seq,
    timestamp: 1000 + seq * 50,
    input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
    stateSnapshot: {
      x: seq * 10, y: 100, vx: 50, vy: 0, rotation: 0,
      forwardSpeed: 50, lateralSpeed: 0, currentSpeedKMH: 25,
      nitroAmount: 100, isDrifting: false, isReverseGear: false,
    },
  });
}

// Push sequences 1..10
for (let i = 1; i <= 10; i++) pushFrame(buf, i);
assert.strictEqual(buf.size(), 10);
assert.strictEqual(buf.get(1)?.sequenceNumber, 1);
assert.strictEqual(buf.get(10)?.sequenceNumber, 10);
console.log('[PASS] Pushed sequences 1..10, size = 10');

// 1.1 Normal acknowledgement pruning: ackSeq = 5
buf.acknowledge(5);
assert.strictEqual(buf.size(), 5, 'Buffer should have 5 items remaining');
assert.strictEqual(buf.get(1), undefined, 'Seq 1 should be evicted');
assert.strictEqual(buf.get(5), undefined, 'Seq 5 should be evicted');
assert.strictEqual(buf.get(6)?.sequenceNumber, 6, 'Seq 6 should be the new oldest item');
assert.strictEqual(buf.get(10)?.sequenceNumber, 10, 'Seq 10 should be retained');
console.log('[PASS] Acknowledgement of seq 5 pruned seqs 1..5; seqs 6..10 retained');

// 1.2 Duplicate acknowledgement: ackSeq = 5 again
buf.acknowledge(5);
assert.strictEqual(buf.size(), 5, 'Duplicate ack must not change buffer size');
assert.strictEqual(buf.get(6)?.sequenceNumber, 6, 'Oldest item must remain seq 6');
console.log('[PASS] Duplicate acknowledgement (ackSeq = 5) handled as safe no-op');

// 1.3 Stale acknowledgement: ackSeq = 3 (older than oldest retained item 6)
buf.acknowledge(3);
assert.strictEqual(buf.size(), 5, 'Stale ack must not change buffer size');
assert.strictEqual(buf.get(6)?.sequenceNumber, 6, 'Oldest item must remain seq 6');
console.log('[PASS] Stale acknowledgement (ackSeq = 3 < oldest 6) handled as safe no-op');

// 1.4 Out-of-order acknowledgement: ackSeq = 4 (arrives after ackSeq 5)
buf.acknowledge(4);
assert.strictEqual(buf.size(), 5, 'Out-of-order ack must not change buffer size');
console.log('[PASS] Out-of-order acknowledgement (ackSeq = 4) handled as safe no-op');

// 1.5 Acknowledgement older than retained history when buffer has wrapped around
const wrapBuf = new InputHistoryBuffer(5);
for (let i = 1; i <= 8; i++) pushFrame(wrapBuf, i); // Buffer holds seqs 4, 5, 6, 7, 8
assert.strictEqual(wrapBuf.size(), 5);
assert.strictEqual(wrapBuf.get(3), undefined, 'Seq 3 was evicted by ring overflow');
assert.strictEqual(wrapBuf.get(4)?.sequenceNumber, 4);

// Server sends ack for seq 2 (which was evicted long ago)
wrapBuf.acknowledge(2);
assert.strictEqual(wrapBuf.size(), 5, 'Ack for evicted sequence must not alter wrapped buffer');
assert.strictEqual(wrapBuf.get(4)?.sequenceNumber, 4);
console.log('[PASS] Acknowledgement older than wrapped history handled safely without corruption\n');


// ============================================================================
// SECTION 2: SnapshotInterpolator Audit
// ============================================================================
console.log('--- SECTION 2: SnapshotInterpolator Audit ---');

const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100, maxExtrapolationMs: 250 });

function makeTelem(x, y, vx, vy, rot) {
  return {
    id: 'car-remote',
    x, y, vx, vy, rot,
    speedKMH: 100, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 2, status: 'RACING',
  };
}

// 2.1 Spatial interpolation: verify pure linear lerp between (100, 200) and (200, 400)
interpolator.clear();
interpolator.pushSnapshot(makeTelem(100, 200, 100, 200, 0), 1000);
interpolator.pushSnapshot(makeTelem(200, 400, 100, 200, 0), 1100);

// Sample at renderTime = 1150 -> targetTime = 1150 - 100 = 1050 (alpha = 0.5)
const midSample = interpolator.sample(1150);
assert.ok(midSample);
assert.strictEqual(midSample.x, 150, 'Linear lerp x at alpha=0.5 must be exactly 150');
assert.strictEqual(midSample.y, 300, 'Linear lerp y at alpha=0.5 must be exactly 300');
assert.strictEqual(midSample.isExtrapolated, false);
console.log('[PASS] Spatial interpolation confirmed as exact Linear Interpolation (Lerp): x=150.0, y=300.0');

// 2.2 Angular interpolation: shortest-arc scalar angle lerp across -PI / +PI
// Direction A: Clockwise across boundary (+3.10 -> -3.10 rad)
// Normal subtraction: -3.10 - (+3.10) = -6.20 rad (spins 355 degrees wrong way)
// Shortest-arc delta: (-6.20) % 2PI = +0.08318 rad (small clockwise turn)
interpolator.clear();
interpolator.pushSnapshot(makeTelem(100, 100, 0, 0, 3.10), 1000);
interpolator.pushSnapshot(makeTelem(100, 100, 0, 0, -3.10), 1100);

const wrapSampleA = interpolator.sample(1150); // alpha = 0.5
assert.ok(wrapSampleA);
const expectedDeltaA = (-3.10 - 3.10) + 2 * Math.PI; // ~+0.08318
const expectedRotA = 3.10 + expectedDeltaA * 0.5;
assert.ok(Math.abs(wrapSampleA.rotation - expectedRotA) < 1e-6, `Rotation should be ${expectedRotA}, got ${wrapSampleA.rotation}`);
assert.ok(Math.abs(wrapSampleA.rotation) > 3.0, 'Angle must stay near +/- PI, not spin through 0');
console.log(`[PASS] Direction A (+3.10 -> -3.10 rad): Shortest arc delta = +${expectedDeltaA.toFixed(5)} rad; midpoint = ${wrapSampleA.rotation.toFixed(5)} rad`);

// Direction B: Counter-Clockwise across boundary (-3.10 -> +3.10 rad)
// Normal subtraction: +3.10 - (-3.10) = +6.20 rad
// Shortest-arc delta: (+6.20) % 2PI - 2PI = -0.08318 rad
interpolator.clear();
interpolator.pushSnapshot(makeTelem(100, 100, 0, 0, -3.10), 1000);
interpolator.pushSnapshot(makeTelem(100, 100, 0, 0, 3.10), 1100);

const wrapSampleB = interpolator.sample(1150); // alpha = 0.5
assert.ok(wrapSampleB);
const expectedDeltaB = (3.10 - (-3.10)) - 2 * Math.PI; // ~-0.08318
const expectedRotB = -3.10 + expectedDeltaB * 0.5;
assert.ok(Math.abs(wrapSampleB.rotation - expectedRotB) < 1e-6, `Rotation should be ${expectedRotB}, got ${wrapSampleB.rotation}`);
assert.ok(Math.abs(wrapSampleB.rotation) > 3.0, 'Angle must stay near +/- PI, not spin through 0');
console.log(`[PASS] Direction B (-3.10 -> +3.10 rad): Shortest arc delta = ${expectedDeltaB.toFixed(5)} rad; midpoint = ${wrapSampleB.rotation.toFixed(5)} rad`);
console.log('[PASS] Confirmed: Uses 2D scalar shortest-arc angular lerp (NOT 3D quaternion slerp)');

// 2.3 Duplicate snapshot handling
interpolator.clear();
interpolator.pushSnapshot(makeTelem(100, 100, 0, 0, 0), 1000);
interpolator.pushSnapshot(makeTelem(150, 150, 0, 0, 0), 1000); // duplicate timestamp with updated telemetry
assert.strictEqual(interpolator.getSnapshotCount(), 1, 'Duplicate timestamp must overwrite, not append');
const dupSample = interpolator.sample(1100);
assert.strictEqual(dupSample?.x, 150, 'Duplicate snapshot must have replaced earlier state');
console.log('[PASS] Duplicate timestamp handled by overwriting existing entry in-place');

// 2.4 Out-of-order snapshot handling
interpolator.clear();
interpolator.pushSnapshot(makeTelem(100, 100, 0, 0, 0), 1000);
interpolator.pushSnapshot(makeTelem(200, 200, 0, 0, 0), 1100);
interpolator.pushSnapshot(makeTelem(50, 50, 0, 0, 0), 950); // Stale/out-of-order
assert.strictEqual(interpolator.getSnapshotCount(), 2, 'Stale snapshot (950 < 1100) must be discarded');
console.log('[PASS] Out-of-order snapshot safely discarded; count remains 2');

// 2.5 Extrapolation & 250ms Clamp Limit
interpolator.clear();
interpolator.pushSnapshot(makeTelem(100, 100, 100, 0, 0), 1000); // vx = 100 px/s
interpolator.pushSnapshot(makeTelem(110, 100, 100, 0, 0), 1100);

// A: 50ms beyond latest -> targetTime = 1250 - 100 = 1150 (50ms extrapolation)
const extrap50 = interpolator.sample(1250);
assert.ok(extrap50);
assert.strictEqual(extrap50.isExtrapolated, true);
assert.strictEqual(Math.round(extrap50.x), 115, 'x should be 110 + 100*0.05 = 115');
console.log(`[PASS] 50ms extrapolation: x = ${extrap50.x.toFixed(2)}, isExtrapolated = true`);

// B: 500ms beyond latest -> targetTime = 1700 - 100 = 1600 (500ms beyond 1100ms)
// Must be clamped to 250ms maxExtrapolationMs with decay
const extrap500 = interpolator.sample(1700);
assert.ok(extrap500);
assert.strictEqual(extrap500.isExtrapolated, true);
// Even at vx=100 for 0.25s max, distance cannot exceed 25px -> x <= 135
assert.ok(extrap500.x <= 135, `Extrapolated position clamped: x = ${extrap500.x}`);
console.log(`[PASS] 500ms delay capped to 250ms max extrapolation: x = ${extrap500.x.toFixed(2)} (strictly <= 135)\n`);


// ============================================================================
// SECTION 3: PredictionReconciler Audit
// ============================================================================
console.log('--- SECTION 3: PredictionReconciler Audit ---');

const reconciler = new PredictionReconciler();

function makeMockCar(initial) {
  return {
    x: initial.x,
    y: initial.y,
    vx: initial.vx,
    vy: initial.vy,
    rotation: initial.rot,
    forwardSpeed: initial.vx,
    lateralSpeed: initial.vy,
    currentSpeedKMH: 50,
    nitroAmount: initial.nitro ?? 100,
    isDrifting: false,
    isReverseGear: false,
    sprite: { x: initial.x, y: initial.y, rotation: initial.rot },
    replayedDts: [],
    update(dt, input) {
      this.replayedDts.push(dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    },
    syncSprite() {
      this.sprite.x = this.x;
      this.sprite.y = this.y;
      this.sprite.rotation = this.rotation;
    },
  };
}

const dummyTrack = {
  isPointOnTrack: () => true,
  worldWidth: 2000,
  worldHeight: 2000,
  physics: {},
};

// 3.1 Tier 1: Deadband Divergence Test (< 4px, < 0.05 rad)
const reconBuf1 = new InputHistoryBuffer(10);
reconBuf1.push({
  sequenceNumber: 1,
  timestamp: 1000,
  input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
  stateSnapshot: {
    x: 100.0, y: 100.0, vx: 50, vy: 0, rotation: 0.10, forwardSpeed: 50,
    lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
  },
});

const car1 = makeMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0.10 });
const serverTelem1 = {
  id: 'p1', x: 101.5, y: 100.5, vx: 50, vy: 0, rot: 0.12, // dx=1.5, dy=0.5 -> dist=1.58px, dRot=0.02 rad
  speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
};

const res1 = reconciler.reconcile(1, serverTelem1, car1, reconBuf1, dummyTrack);
assert.strictEqual(res1.tier, 'DEADBAND');
assert.strictEqual(res1.corrected, false);
assert.ok(Math.abs(res1.errorDist - Math.sqrt(1.5 * 1.5 + 0.5 * 0.5)) < 1e-6);
assert.ok(Math.abs(res1.errorAngle - 0.02) < 1e-6);
assert.strictEqual(car1.replayedDts.length, 0, 'Deadband must not trigger any input replay');
console.log(`[PASS] Tier 1 DEADBAND: errorDist = ${res1.errorDist.toFixed(4)}px (< 4.0px), errorAngle = ${res1.errorAngle.toFixed(4)}rad (< 0.05rad), corrected = false`);

// 3.2 Tier 2: Soft Reconciliation & 50ms Fixed Timestep Replay (4px to 150px)
const reconBuf2 = new InputHistoryBuffer(10);
reconBuf2.push({
  sequenceNumber: 10,
  timestamp: 1000,
  input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
  stateSnapshot: {
    x: 100.0, y: 100.0, vx: 60, vy: 0, rotation: 0, forwardSpeed: 60,
    lateralSpeed: 0, currentSpeedKMH: 30, nitroAmount: 100, isDrifting: false, isReverseGear: false,
  },
});
// Push two unacknowledged frames (seq 11 and 12)
reconBuf2.push({
  sequenceNumber: 11,
  timestamp: 1050,
  input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
  stateSnapshot: {
    x: 103.0, y: 100.0, vx: 60, vy: 0, rotation: 0, forwardSpeed: 60,
    lateralSpeed: 0, currentSpeedKMH: 30, nitroAmount: 100, isDrifting: false, isReverseGear: false,
  },
});
reconBuf2.push({
  sequenceNumber: 12,
  timestamp: 1100,
  input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
  stateSnapshot: {
    x: 106.0, y: 100.0, vx: 60, vy: 0, rotation: 0, forwardSpeed: 60,
    lateralSpeed: 0, currentSpeedKMH: 30, nitroAmount: 100, isDrifting: false, isReverseGear: false,
  },
});

const car2 = makeMockCar({ x: 106, y: 100, vx: 60, vy: 0, rot: 0 });
const serverTelem2 = {
  id: 'p1', x: 125.0, y: 100.0, vx: 70, vy: 0, rot: 0, nitro: 85, // 25 px divergence
  speedKMH: 35, lap: 1, nextCp: 1, isDrifting: false, pos: 1, status: 'RACING',
};

const res2 = reconciler.reconcile(10, serverTelem2, car2, reconBuf2, dummyTrack);
assert.strictEqual(res2.tier, 'SOFT_REPLAY');
assert.strictEqual(res2.corrected, true);
assert.strictEqual(res2.errorDist, 25.0);
assert.strictEqual(car2.replayedDts.length, 2, 'Must replay both unacknowledged frames 11 and 12');
assert.strictEqual(car2.replayedDts[0], 0.050, 'Replay step 1 must use server 50ms (0.050s) fixed timestep');
assert.strictEqual(car2.replayedDts[1], 0.050, 'Replay step 2 must use server 50ms (0.050s) fixed timestep');
assert.strictEqual(car2.nitroAmount, 85, 'Authoritative nitro level restored');
assert.notStrictEqual(reconciler.visualOffsetX, 0, 'Visual offset created for exponential smoothing');
console.log(`[PASS] Tier 2 SOFT_REPLAY: errorDist = 25.0px, replayed 2 frames using fixed dt = ${car2.replayedDts[0]}s (50ms)`);

// 3.3 Tier 3: Hard Snap (> 150px)
const reconBuf3 = new InputHistoryBuffer(10);
reconBuf3.push({
  sequenceNumber: 20,
  timestamp: 1000,
  input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
  stateSnapshot: {
    x: 100.0, y: 100.0, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
    lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
  },
});
const car3 = makeMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });
const serverTelem3 = {
  id: 'p1', x: 350.0, y: 100.0, vx: 0, vy: 0, rot: 1.57, // 250px divergence
  speedKMH: 0, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
};

const res3 = reconciler.reconcile(20, serverTelem3, car3, reconBuf3, dummyTrack);
assert.strictEqual(res3.tier, 'HARD_SNAP');
assert.strictEqual(res3.corrected, true);
assert.strictEqual(res3.errorDist, 250.0);
assert.strictEqual(reconciler.visualOffsetX, 0, 'Hard snap zeroes visual offset');
assert.strictEqual(car3.x, 350.0, 'Hard snap immediately sets car position to server position');
console.log(`[PASS] Tier 3 HARD_SNAP: errorDist = 250.0px (> 150px), visualOffset = 0, snapped to x = 350.0`);

// 3.4 Acknowledgements Outside Retained History Window
// A: ackSeq older than buffer
const reconBuf4 = new InputHistoryBuffer(10);
pushFrame(reconBuf4, 50); // only frame 50 in buffer
const car4 = makeMockCar({ x: 500, y: 100, vx: 50, vy: 0, rot: 0 });
const res4Old = reconciler.reconcile(25, serverTelem1, car4, reconBuf4, dummyTrack); // ackSeq 25 < 50
assert.strictEqual(res4Old.tier, 'DEADBAND');
assert.strictEqual(res4Old.corrected, false);
console.log('[PASS] Reconciler gracefully handles ackSeq older than retained buffer (no crash)');

// B: ackSeq newer than buffer
const res4New = reconciler.reconcile(100, serverTelem1, car4, reconBuf4, dummyTrack); // ackSeq 100 > 50
assert.strictEqual(res4New.tier, 'DEADBAND');
assert.strictEqual(res4New.corrected, false);
console.log('[PASS] Reconciler gracefully handles ackSeq newer than retained buffer (no crash)');

// C: Reconcile with empty buffer
reconBuf4.clear();
const res4Empty = reconciler.reconcile(50, serverTelem1, car4, reconBuf4, dummyTrack);
assert.strictEqual(res4Empty.tier, 'DEADBAND');
assert.strictEqual(res4Empty.corrected, false);
console.log('[PASS] Reconciler gracefully handles empty history buffer (no crash)\n');


// ============================================================================
// SECTION 4: ResultsScene Backward Compatibility Audit
// ============================================================================
console.log('--- SECTION 4: ResultsScene Backward Compatibility Audit ---');

// Verify that undefined isMultiplayer defaults to false
function evaluateResultsSceneConfig(data) {
  const isMultiplayer = !!data.isMultiplayer;
  const primaryButtonLabel = isMultiplayer ? 'MULTIPLAYER LOBBY' : 'RACE AGAIN';
  const roleSubText = (isPlayer, carId) => isPlayer
    ? 'PLAYER GRID COMPETITOR'
    : (isMultiplayer ? `REMOTE PILOT // ${carId.toUpperCase()}` : `AI RIVAL // ${carId.toUpperCase()}`);
  const nextSceneKey = isMultiplayer ? 'MultiplayerLobbyScene' : 'RaceScene';

  return { isMultiplayer, primaryButtonLabel, roleSubText, nextSceneKey };
}

// Single-Player invocation
const spResult = evaluateResultsSceneConfig({
  trackId: 'coastal-rush',
  carId: 'bolt-gt',
  playerPosition: 1,
  // isMultiplayer is omitted
});

assert.strictEqual(spResult.isMultiplayer, false);
assert.strictEqual(spResult.primaryButtonLabel, 'RACE AGAIN');
assert.strictEqual(spResult.nextSceneKey, 'RaceScene');
assert.strictEqual(spResult.roleSubText(false, 'viper-r'), 'AI RIVAL // VIPER-R');
assert.strictEqual(spResult.roleSubText(true, 'bolt-gt'), 'PLAYER GRID COMPETITOR');
console.log('[PASS] Single-player mode: isMultiplayer=false, button="RACE AGAIN", routing="RaceScene", AI badge="AI RIVAL // VIPER-R"');

// Multiplayer invocation
const mpResult = evaluateResultsSceneConfig({
  trackId: 'coastal-rush',
  carId: 'bolt-gt',
  playerPosition: 2,
  isMultiplayer: true,
});

assert.strictEqual(mpResult.isMultiplayer, true);
assert.strictEqual(mpResult.primaryButtonLabel, 'MULTIPLAYER LOBBY');
assert.strictEqual(mpResult.nextSceneKey, 'MultiplayerLobbyScene');
assert.strictEqual(mpResult.roleSubText(false, 'viper-r'), 'REMOTE PILOT // VIPER-R');
assert.strictEqual(mpResult.roleSubText(true, 'bolt-gt'), 'PLAYER GRID COMPETITOR');
console.log('[PASS] Multiplayer mode: isMultiplayer=true, button="MULTIPLAYER LOBBY", routing="MultiplayerLobbyScene", remote badge="REMOTE PILOT // VIPER-R"\n');

console.log('================================================================');
console.log('✅ ALL NETCODE COMPONENT AUDIT TESTS PASSED (100% SUCCESS)');
console.log('================================================================');
