/**
 * Nitro Rush — Phase 3.1 Netcode Utilities Unit Tests
 *
 * Verifies:
 * 1. InputHistoryBuffer ring buffer, monotonic indexing, capacity eviction, and ACK pruning.
 * 2. SnapshotInterpolator jitter delay, linear interpolation, angle slerp, and capped extrapolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { InputHistoryBuffer, type InputHistoryItem } from '../../src/multiplayer/InputHistoryBuffer.ts';
import { SnapshotInterpolator } from '../../src/multiplayer/SnapshotInterpolator.ts';
import { MultiplayerGrid } from '../../src/multiplayer/MultiplayerGrid.ts';
import { PredictionReconciler } from '../../src/multiplayer/PredictionReconciler.ts';
import type { VehicleTelemetry } from '../../src/multiplayer/ProtocolTypes.ts';

describe('InputHistoryBuffer Unit Tests', () => {
  it('initializes with specified capacity and empty state', () => {
    const buffer = new InputHistoryBuffer(10);
    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(buffer.getCapacity(), 10);
    assert.strictEqual(buffer.latest(), undefined);
    assert.deepStrictEqual(buffer.getUnacknowledged(), []);
  });

  it('rejects non-positive capacity values', () => {
    assert.throws(() => new InputHistoryBuffer(0), /Capacity must be greater than zero/);
    assert.throws(() => new InputHistoryBuffer(-5), /Capacity must be greater than zero/);
  });

  it('pushes items and retrieves by sequence number', () => {
    const buffer = new InputHistoryBuffer(5);

    const item1: InputHistoryItem = {
      sequenceNumber: 1,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 200, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    };

    const item2: InputHistoryItem = {
      sequenceNumber: 2,
      timestamp: 1050,
      input: { throttle: 1, brake: 0, steer: 0.5, drift: false, nitro: false },
      stateSnapshot: {
        x: 102.5, y: 200, vx: 55, vy: 5, rotation: 0.1, forwardSpeed: 55,
        lateralSpeed: 0, currentSpeedKMH: 22, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    };

    buffer.push(item1);
    buffer.push(item2);

    assert.strictEqual(buffer.size(), 2);
    assert.strictEqual(buffer.get(1)?.timestamp, 1000);
    assert.strictEqual(buffer.get(2)?.sequenceNumber, 2);
    assert.strictEqual(buffer.get(3), undefined);
    assert.strictEqual(buffer.latest()?.sequenceNumber, 2);
  });

  it('evicts oldest items when capacity is reached', () => {
    const buffer = new InputHistoryBuffer(3);

    for (let i = 1; i <= 5; i++) {
      buffer.push({
        sequenceNumber: i,
        timestamp: 1000 + i * 50,
        input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
        stateSnapshot: {
          x: i * 10, y: 0, vx: 10, vy: 0, rotation: 0, forwardSpeed: 10,
          lateralSpeed: 0, currentSpeedKMH: 4, nitroAmount: 100, isDrifting: false, isReverseGear: false,
        },
      });
    }

    // Capacity is 3, items 1 and 2 should have been evicted
    assert.strictEqual(buffer.size(), 3);
    assert.strictEqual(buffer.get(1), undefined);
    assert.strictEqual(buffer.get(2), undefined);
    assert.strictEqual(buffer.get(3)?.sequenceNumber, 3);
    assert.strictEqual(buffer.get(4)?.sequenceNumber, 4);
    assert.strictEqual(buffer.get(5)?.sequenceNumber, 5);

    const unacked = buffer.getUnacknowledged();
    assert.strictEqual(unacked.length, 3);
    assert.strictEqual(unacked[0].sequenceNumber, 3);
    assert.strictEqual(unacked[2].sequenceNumber, 5);
  });

  it('acknowledges and prunes entries up to ackSeq', () => {
    const buffer = new InputHistoryBuffer(10);

    for (let i = 1; i <= 6; i++) {
      buffer.push({
        sequenceNumber: i,
        timestamp: 1000 + i * 50,
        input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
        stateSnapshot: {
          x: i * 10, y: 0, vx: 10, vy: 0, rotation: 0, forwardSpeed: 10,
          lateralSpeed: 0, currentSpeedKMH: 4, nitroAmount: 100, isDrifting: false, isReverseGear: false,
        },
      });
    }

    assert.strictEqual(buffer.size(), 6);

    // Ack sequence 4 -> evict 1, 2, 3, 4
    buffer.acknowledge(4);
    assert.strictEqual(buffer.size(), 2);
    assert.strictEqual(buffer.get(1), undefined);
    assert.strictEqual(buffer.get(4), undefined);
    assert.strictEqual(buffer.get(5)?.sequenceNumber, 5);
    assert.strictEqual(buffer.get(6)?.sequenceNumber, 6);

    const remaining = buffer.getUnacknowledged();
    assert.deepStrictEqual(remaining.map((r) => r.sequenceNumber), [5, 6]);
  });

  it('clears all items cleanly', () => {
    const buffer = new InputHistoryBuffer(5);
    buffer.push({
      sequenceNumber: 1,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 0, y: 0, vx: 0, vy: 0, rotation: 0, forwardSpeed: 0,
        lateralSpeed: 0, currentSpeedKMH: 0, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });
    assert.strictEqual(buffer.size(), 1);
    buffer.clear();
    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(buffer.latest(), undefined);
  });
});

describe('SnapshotInterpolator Unit Tests', () => {
  function makeTelemetry(id: string, x: number, y: number, vx: number, vy: number, rot: number): VehicleTelemetry {
    return {
      id,
      x,
      y,
      vx,
      vy,
      rot,
      speedKMH: 100,
      lap: 1,
      nextCp: 2,
      nitro: 100,
      isDrifting: false,
      pos: 1,
      status: 'RACING',
    };
  }

  it('returns null when no snapshots have been received', () => {
    const interpolator = new SnapshotInterpolator();
    assert.strictEqual(interpolator.sample(1000), null);
  });

  it('returns single snapshot directly regardless of time', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100 });
    const t = makeTelemetry('p1', 500, 300, 40, 0, 1.57);
    interpolator.pushSnapshot(t, 1000);

    const sample = interpolator.sample(1200);
    assert.ok(sample);
    assert.strictEqual(sample.x, 500);
    assert.strictEqual(sample.y, 300);
    assert.strictEqual(sample.rotation, 1.57);
    assert.strictEqual(sample.isExtrapolated, false);
  });

  it('interpolates midpoint position and velocity between two snapshots', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100 });

    const t1 = makeTelemetry('p1', 100, 200, 20, 0, 0);
    const t2 = makeTelemetry('p1', 200, 400, 40, 20, 0.5);

    interpolator.pushSnapshot(t1, 1000);
    interpolator.pushSnapshot(t2, 1100);

    // renderTimeMs = 1150 -> targetTime = 1150 - 100 = 1050 (exact midpoint, alpha = 0.5)
    const sample = interpolator.sample(1150);
    assert.ok(sample);
    assert.strictEqual(sample.x, 150);
    assert.strictEqual(sample.y, 300);
    assert.strictEqual(sample.vx, 30);
    assert.strictEqual(sample.vy, 10);
    assert.strictEqual(sample.rotation, 0.25);
    assert.strictEqual(sample.isExtrapolated, false);
  });

  it('interpolates angles correctly across the -PI to +PI wraparound boundary', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100 });

    // Heading wraps from +3.10 rad to -3.10 rad (short rotation across PI boundary)
    const t1 = makeTelemetry('p1', 100, 100, 0, 0, 3.10);
    const t2 = makeTelemetry('p1', 100, 100, 0, 0, -3.10);

    interpolator.pushSnapshot(t1, 1000);
    interpolator.pushSnapshot(t2, 1100);

    // Midpoint: targetTime = 1050
    const sample = interpolator.sample(1150);
    assert.ok(sample);

    // Should NOT spin 360 degrees: shortest delta is ~(2 * PI - 6.20) = ~0.083
    // Rotation should stay near +/- PI (~3.14)
    assert.ok(Math.abs(sample.rotation) > 3.0);
  });

  it('extrapolates along velocity when target time exceeds latest snapshot', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100, maxExtrapolationMs: 250 });

    const t1 = makeTelemetry('p1', 100, 100, 100, 0, 0); // moving +X at 100 px/s
    interpolator.pushSnapshot(t1, 1000);

    const t2 = makeTelemetry('p1', 110, 100, 100, 0, 0); // 100ms later at x=110
    interpolator.pushSnapshot(t2, 1100);

    // Target time: renderTimeMs = 1250 -> targetTime = 1250 - 100 = 1150 (50ms beyond latest)
    const sample = interpolator.sample(1250);
    assert.ok(sample);
    assert.strictEqual(sample.isExtrapolated, true);

    // Extrapolated: x = 110 + 100 * 0.05 = 115
    assert.strictEqual(Math.round(sample.x), 115);
    assert.strictEqual(sample.y, 100);
  });

  it('caps extrapolation at maxExtrapolationMs to prevent runaway vehicles', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100, maxExtrapolationMs: 200 });

    const t1 = makeTelemetry('p1', 100, 100, 100, 0, 0);
    const t2 = makeTelemetry('p1', 110, 100, 100, 0, 0);
    interpolator.pushSnapshot(t1, 1000);
    interpolator.pushSnapshot(t2, 1100);

    // Target time: renderTimeMs = 2000 -> targetTime = 1900 (800ms beyond latest, exceeding 200ms cap)
    const sample = interpolator.sample(2000);
    assert.ok(sample);
    assert.strictEqual(sample.isExtrapolated, true);

    // Effective elapsed capped at 200ms: x = 100 + (decayed vx * 0.2s)
    // Position should be bounded, definitely < 150
    assert.ok(sample.x <= 130);
  });

  it('ignores out-of-order stale snapshots', () => {
    const interpolator = new SnapshotInterpolator();

    const t1 = makeTelemetry('p1', 100, 100, 0, 0, 0);
    const t2 = makeTelemetry('p1', 200, 200, 0, 0, 0);
    const tStale = makeTelemetry('p1', 50, 50, 0, 0, 0);

    interpolator.pushSnapshot(t1, 1000);
    interpolator.pushSnapshot(t2, 1100);
    interpolator.pushSnapshot(tStale, 950); // Stale

    assert.strictEqual(interpolator.getSnapshotCount(), 2);
  });

  it('synchronizes client monotonic timebase to server elapsed simulation time', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100 });

    // Snapshot 1: serverTime = 2000ms, arrived at local monotonic clock 10000ms
    // Snapshot 2: serverTime = 2050ms, arrived at local monotonic clock 10050ms
    // Snapshot 3: serverTime = 2100ms, arrived at local monotonic clock 10100ms
    const t1 = makeTelemetry('p1', 100, 200, 20, 0, 0);
    const t2 = makeTelemetry('p1', 150, 200, 20, 0, 0);
    const t3 = makeTelemetry('p1', 200, 200, 20, 0, 0);

    interpolator.pushSnapshot(t1, 2000, 10000);
    interpolator.pushSnapshot(t2, 2050, 10050);
    interpolator.pushSnapshot(t3, 2100, 10100);

    // Initial offset must be 2000 - 10000 = -8000ms
    assert.strictEqual(Math.round(interpolator.getServerTimeOffset()!), -8000);

    // Sample at client monotonic time 10125ms
    // Estimated server time: 10125 + (-8000) = 2125ms
    // Target render time: 2125 - 100 = 2025ms (exact midpoint between s1 at 2000 and s2 at 2050, alpha = 0.5)
    const sample = interpolator.sample(10125);
    assert.ok(sample);
    assert.strictEqual(sample.x, 125); // Midpoint between 100 and 150
    assert.strictEqual(sample.y, 200);
    assert.strictEqual(sample.isExtrapolated, false);
  });

  it('smooths network arrival jitter without jumping', () => {
    const interpolator = new SnapshotInterpolator();

    // Baseline: serverTime 1000, arrival 5000 -> offset = -4000
    interpolator.pushSnapshot(makeTelemetry('p1', 0, 0, 0, 0, 0), 1000, 5000);
    assert.strictEqual(interpolator.getServerTimeOffset(), -4000);

    // Jittered packet: arrives 20ms late (arrival 5070 for serverTime 1050)
    // Instantaneous offset = 1050 - 5070 = -4020 (diff = -20)
    // With 10% EMA filter, new offset = -4000 + (-20 * 0.1) = -4002
    interpolator.pushSnapshot(makeTelemetry('p1', 10, 0, 0, 0, 0), 1050, 5070);
    assert.strictEqual(Math.round(interpolator.getServerTimeOffset()!), -4002);
  });

  it('snaps clock offset immediately on large timing irregularities (>200ms)', () => {
    const interpolator = new SnapshotInterpolator();

    interpolator.pushSnapshot(makeTelemetry('p1', 0, 0, 0, 0, 0), 1000, 5000);
    assert.strictEqual(interpolator.getServerTimeOffset(), -4000);

    // Major hitch / reconnection delay: arrival 6500 for serverTime 2000
    // Instantaneous offset = 2000 - 6500 = -4500 (diff = -500, exceeds 200ms threshold)
    // Must snap immediately to -4500 rather than sluggishly converging
    interpolator.pushSnapshot(makeTelemetry('p1', 10, 0, 0, 0, 0), 2000, 6500);
    assert.strictEqual(interpolator.getServerTimeOffset(), -4500);
  });

  it('extrapolates with bounded limit when subsequent snapshot arrivals are delayed', () => {
    const interpolator = new SnapshotInterpolator({ interpolationDelayMs: 100, maxExtrapolationMs: 250 });

    // s1 at serverTime 1000, arrived at monotonic 5000
    // s2 at serverTime 1050, arrived at monotonic 5050
    // Moving +X at 100 px/s
    interpolator.pushSnapshot(makeTelemetry('p1', 100, 100, 100, 0, 0), 1000, 5000);
    interpolator.pushSnapshot(makeTelemetry('p1', 105, 100, 100, 0, 0), 1050, 5050);

    // Render at monotonic 5200 (150ms after last snapshot arrival)
    // Estimated server time: 5200 - 3950 ≈ 1200ms
    // Target time: 1200 - 100 = 1100ms (50ms beyond s2 at 1050ms)
    const sample = interpolator.sample(5200);
    assert.ok(sample);
    assert.strictEqual(sample.isExtrapolated, true);
    // Extrapolated: x = 105 + (100 * ~0.05s) ≈ 110
    assert.ok(sample.x > 105 && sample.x <= 112);
  });
});

describe('MultiplayerGrid Unit Tests', () => {
  it('generates exactly 8 starting grid slots labeled P1 through P8', () => {
    const cp0 = { x: 500, y: 500, angle: 0 };
    const grid = MultiplayerGrid.generateGrid(cp0);

    assert.strictEqual(grid.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.strictEqual(grid[i].slot, `P${i + 1}`);
      assert.strictEqual(grid[i].angle, 0);
    }
  });

  it('conforms to longitudinal row spacing of 60px behind CP0', () => {
    // Heading directly East (angle 0): cos=1, sin=0, normX=0, normY=1
    // dLong = 90 + i * 60 -> x = 500 - dLong
    const cp0 = { x: 1000, y: 500, angle: 0 };
    const grid = MultiplayerGrid.generateGrid(cp0);

    for (let i = 0; i < 8; i++) {
      const expectedDLong = 90 + i * 60;
      const expectedX = 1000 - expectedDLong;
      assert.strictEqual(Math.round(grid[i].x), expectedX);
    }
  });

  it('conforms to alternating lateral offsets of +/-28px', () => {
    // Heading directly East (angle 0): normY = 1 -> y = 500 + dLat
    // Even indices: -28 -> y = 472; Odd indices: +28 -> y = 528
    const cp0 = { x: 1000, y: 500, angle: 0 };
    const grid = MultiplayerGrid.generateGrid(cp0);

    assert.strictEqual(grid[0].y, 500 - 28);
    assert.strictEqual(grid[1].y, 500 + 28);
    assert.strictEqual(grid[2].y, 500 - 28);
    assert.strictEqual(grid[3].y, 500 + 28);
    assert.strictEqual(grid[4].y, 500 - 28);
    assert.strictEqual(grid[5].y, 500 + 28);
    assert.strictEqual(grid[6].y, 500 - 28);
    assert.strictEqual(grid[7].y, 500 + 28);
  });

  it('rotates starting positions accurately with non-zero checkpoint angles', () => {
    // Heading North (angle -PI/2): cos=0, sin=-1, normX=1, normY=0
    // dLong = 90 + i * 60 -> y = cp0.y - dLong * (-1) = cp0.y + dLong (behind start line)
    const cp0 = { x: 500, y: 500, angle: -Math.PI / 2 };
    const grid = MultiplayerGrid.generateGrid(cp0);

    assert.strictEqual(grid.length, 8);
    // P1 (i=0): dLong=90, dLat=-28 -> y = 500 + 90 = 590, x = 500 + (-28)*1 = 472
    assert.strictEqual(Math.round(grid[0].y), 590);
    assert.strictEqual(Math.round(grid[0].x), 472);
    assert.strictEqual(grid[0].angle, -Math.PI / 2);
  });
});

describe('PredictionReconciler Unit Tests', () => {
  function createMockCar(initial: { x: number; y: number; vx: number; vy: number; rot: number }) {
    return {
      x: initial.x,
      y: initial.y,
      vx: initial.vx,
      vy: initial.vy,
      rotation: initial.rot,
      forwardSpeed: initial.vx,
      lateralSpeed: initial.vy,
      currentSpeedKMH: 50,
      nitroAmount: 100,
      isDrifting: false,
      isReverseGear: false,
      sprite: { x: initial.x, y: initial.y, rotation: initial.rot },
      updateCount: 0,
      update(_dt: number, _input: any) {
        this.updateCount++;
        this.x += this.vx * _dt;
        this.y += this.vy * _dt;
      },
      syncSprite() {
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.rotation = this.rotation;
      },
    };
  }

  const mockTrack = {
    isPointOnTrack: () => true,
    worldWidth: 2000,
    worldHeight: 2000,
    physics: {},
  };

  it('Tier 1: ignores errors within deadband (< 4.0 px and < 0.05 rad)', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    // Store predicted frame at seq 10
    buffer.push({
      sequenceNumber: 10,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server telemetry with 2.0 px divergence (well within 4.0 px deadband)
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 102.0, y: 100.0, vx: 50, vy: 0, rot: 0.02,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(10, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.tier, 'DEADBAND');
    assert.strictEqual(result.corrected, false);
    assert.strictEqual(car.updateCount, 0); // No input replay needed
    assert.strictEqual(buffer.size(), 0); // Seq 10 pruned
  });

  it('Tier 2: triggers soft replay and visual offset when error is between 4px and 150px', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 120, y: 100, vx: 50, vy: 0, rot: 0 });

    // Push acked frame (seq 10) and unacked frame (seq 11)
    buffer.push({
      sequenceNumber: 10,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    buffer.push({
      sequenceNumber: 11,
      timestamp: 1050,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 102.5, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server telemetry at seq 10 is at x: 115 (15 px divergence -> Tier 2)
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 115.0, y: 100.0, vx: 50, vy: 0, rot: 0,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(10, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.tier, 'SOFT_REPLAY');
    assert.strictEqual(result.corrected, true);
    assert.strictEqual(result.errorDist, 15.0);
    assert.strictEqual(car.updateCount, 1); // Replayed unacked frame 11
    assert.notStrictEqual(reconciler.visualOffsetX, 0); // Smoothing offset created
  });

  it('Tier 3: triggers hard snap when error exceeds 150px without visual offset', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    buffer.push({
      sequenceNumber: 10,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server telemetry at seq 10 is at x: 300 (200 px divergence -> Tier 3 hard snap)
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 300.0, y: 100.0, vx: 50, vy: 0, rot: 0,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(10, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.tier, 'HARD_SNAP');
    assert.strictEqual(result.corrected, true);
    assert.strictEqual(reconciler.visualOffsetX, 0);
    assert.strictEqual(reconciler.visualOffsetY, 0);
    assert.strictEqual(car.x, 300);
  });

  it('updateVisualSmoothing decays visual offset exponentially towards zero', () => {
    const reconciler = new PredictionReconciler();
    const car = createMockCar({ x: 200, y: 200, vx: 0, vy: 0, rot: 0 });

    reconciler.visualOffsetX = 20;
    reconciler.visualOffsetY = 10;

    reconciler.updateVisualSmoothing(car as any, 0.5);
    assert.strictEqual(reconciler.visualOffsetX, 10);
    assert.strictEqual(reconciler.visualOffsetY, 5);

    reconciler.updateVisualSmoothing(car as any, 0.5);
    assert.strictEqual(reconciler.visualOffsetX, 5);
    assert.strictEqual(reconciler.visualOffsetY, 2.5);

    // After several frames, it snaps to 0
    for (let i = 0; i < 5; i++) {
      reconciler.updateVisualSmoothing(car as any, 0.5);
    }
    assert.strictEqual(reconciler.visualOffsetX, 0);
    assert.strictEqual(reconciler.visualOffsetY, 0);
  });

  it('authoritative fallback: safely restores server state when acknowledged frame is missing', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    // History buffer is empty (e.g. initial connection, buffer reset, or evicted frame)
    assert.strictEqual(buffer.size(), 0);

    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 250.0, y: 350.0, vx: 80, vy: 10, rot: 1.57,
      speedKMH: 32, lap: 1, nextCp: 1, nitro: 85, isDrifting: false, pos: 1, status: 'RACING',
    };

    // Server sends ackSeq 5, which does not exist in buffer
    const result = reconciler.reconcile(5, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.corrected, true);
    assert.strictEqual(car.x, 250.0, 'Car X must be restored to authoritative server telemetry');
    assert.strictEqual(car.y, 350.0, 'Car Y must be restored to authoritative server telemetry');
    assert.strictEqual(car.vx, 80);
    assert.strictEqual(car.vy, 10);
    assert.strictEqual(car.rotation, 1.57);
    assert.strictEqual(car.nitroAmount, 85);
    assert.strictEqual(car.updateCount, 0, 'No unacked inputs to replay on empty history');
  });

  it('authoritative fallback: replays valid unacknowledged inputs following an evicted frame', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    // History contains only sequences 6 and 7 (sequence 5 was evicted due to capacity or stall)
    buffer.push({
      sequenceNumber: 6,
      timestamp: 1050,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 105, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    buffer.push({
      sequenceNumber: 7,
      timestamp: 1100,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 110, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server acknowledges sequence 5 (missing) at position x: 200
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 200.0, y: 100.0, vx: 50, vy: 0, rot: 0,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(5, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.corrected, true);
    // Sequences 6 and 7 must be replayed forward from server state
    assert.strictEqual(car.updateCount, 2, 'Must replay both remaining unacknowledged inputs (seq 6 and 7)');
    // Buffer should still retain the 2 unacknowledged items
    assert.strictEqual(buffer.size(), 2);
    assert.strictEqual(buffer.get(6)?.sequenceNumber, 6);
    assert.strictEqual(buffer.get(7)?.sequenceNumber, 7);
  });

  it('authoritative fallback: safely handles stale acknowledgements older than oldest stored frame', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    // Buffer has seq 10 and 11
    buffer.push({
      sequenceNumber: 10,
      timestamp: 1500,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });
    buffer.push({
      sequenceNumber: 11,
      timestamp: 1550,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 105, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Stale server acknowledgement with seq 4 (well before seq 10)
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 80.0, y: 100.0, vx: 50, vy: 0, rot: 0,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(4, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.corrected, true);
    // Sequences 10 and 11 are > 4, so they must be preserved and replayed
    assert.strictEqual(buffer.size(), 2);
    assert.strictEqual(car.updateCount, 2);
  });

  it('authoritative fallback: safely clears buffer on future acknowledgements beyond stored history', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    buffer.push({
      sequenceNumber: 1,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server sends future ackSeq 999 (e.g. after client disconnect/reconnect sequence reset)
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 500.0, y: 500.0, vx: 0, vy: 0, rot: 0,
      speedKMH: 0, lap: 2, nextCp: 3, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(999, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.corrected, true);
    // Entire buffer must be evicted
    assert.strictEqual(buffer.size(), 0);
    assert.strictEqual(car.x, 500.0);
    assert.strictEqual(car.updateCount, 0);
  });

  it('smooths small angular errors via visualOffsetRot and decays exponentially to zero', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0.1 });

    buffer.push({
      sequenceNumber: 1,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0.1, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server telemetry rotation has 0.2 rad error (above 0.05 rad deadband, below 1.5708 rad snap)
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 100.0, y: 100.0, vx: 50, vy: 0, rot: 0.3,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(1, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.tier, 'SOFT_REPLAY');
    assert.strictEqual(result.corrected, true);
    assert.ok(Math.abs(reconciler.visualOffsetRot) > 0.05);
    assert.strictEqual(car.rotation, 0.3, 'Underlying physics rotation must match server state');

    // Exponential decay test
    const initialRotOffset = Math.abs(reconciler.visualOffsetRot);
    reconciler.updateVisualSmoothing(car as any, 0.5);
    assert.ok(Math.abs(reconciler.visualOffsetRot) < initialRotOffset);

    // After decay frames, visualOffsetRot clamps to 0
    for (let i = 0; i < 10; i++) {
      reconciler.updateVisualSmoothing(car as any, 0.5);
    }
    assert.strictEqual(reconciler.visualOffsetRot, 0);
  });

  it('triggers HARD_SNAP when angular divergence exceeds 90 degrees (> Math.PI / 2)', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0 });

    buffer.push({
      sequenceNumber: 1,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 0, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server telemetry rotation has 2.0 rad (~114.6 deg) error -> exceeds HARD_SNAP_ANGLE_RAD
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 100.0, y: 100.0, vx: 50, vy: 0, rot: 2.0,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(1, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.tier, 'HARD_SNAP');
    assert.strictEqual(result.corrected, true);
    assert.strictEqual(reconciler.visualOffsetRot, 0, 'Hard snap must zero out angular offset');
    assert.strictEqual(car.rotation, 2.0);
  });

  it('calculates shortest angular distance across -PI / +PI wraparound seam', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    // Local car at +3.10 rad (~177.6 deg)
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 3.10 });

    buffer.push({
      sequenceNumber: 1,
      timestamp: 1000,
      input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
      stateSnapshot: {
        x: 100, y: 100, vx: 50, vy: 0, rotation: 3.10, forwardSpeed: 50,
        lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
      },
    });

    // Server telemetry at -3.10 rad (~ -177.6 deg).
    // Shortest distance is ~0.083 rad, NOT ~6.20 rad!
    const serverTelemetry: VehicleTelemetry = {
      id: 'p1', x: 100.0, y: 100.0, vx: 50, vy: 0, rot: -3.10,
      speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
    };

    const result = reconciler.reconcile(1, serverTelemetry, car as any, buffer, mockTrack as any);

    assert.strictEqual(result.tier, 'SOFT_REPLAY');
    // Error angle must be ~0.083 rad
    assert.ok(result.errorAngle < 0.15, `Shortest arc error angle should be ~0.083 rad, got ${result.errorAngle}`);
    assert.ok(Math.abs(reconciler.visualOffsetRot) < 0.15);
  });

  it('preserves visual stability and prevents offset drift on repeated reconciliations', () => {
    const reconciler = new PredictionReconciler();
    const buffer = new InputHistoryBuffer(10);
    const car = createMockCar({ x: 100, y: 100, vx: 50, vy: 0, rot: 0.1 });

    for (let seq = 1; seq <= 3; seq++) {
      buffer.push({
        sequenceNumber: seq,
        timestamp: 1000 + seq * 50,
        input: { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false },
        stateSnapshot: {
          x: 100, y: 100, vx: 50, vy: 0, rotation: 0.1, forwardSpeed: 50,
          lateralSpeed: 0, currentSpeedKMH: 20, nitroAmount: 100, isDrifting: false, isReverseGear: false,
        },
      });

      const serverTelemetry: VehicleTelemetry = {
        id: 'p1', x: 100.0, y: 100.0, vx: 50, vy: 0, rot: 0.18,
        speedKMH: 20, lap: 1, nextCp: 1, nitro: 100, isDrifting: false, pos: 1, status: 'RACING',
      };

      const result = reconciler.reconcile(seq, serverTelemetry, car as any, buffer, mockTrack as any);
      assert.strictEqual(result.tier, 'SOFT_REPLAY');
      // Visual offset should not exceed single frame delta (~0.08 rad)
      assert.ok(Math.abs(reconciler.visualOffsetRot) <= 0.10);
      reconciler.updateVisualSmoothing(car as any, 0.65);
    }
  });
});

describe('Phase 4.3 Fixed 50ms Physics Accumulator Simulation Tests', () => {
  const FIXED_TIMESTEP_MS = 50;
  const FIXED_TIMESTEP_SEC = 0.050;
  const MAX_ACCUMULATOR_MS = 250;

  function simulateAccumulator(
    frameDeltaMs: number,
    totalFrames: number,
    initialAccumulator: number = 0
  ) {
    let accumulator = initialAccumulator;
    let ticksExecuted = 0;
    let sequenceNumber = 0;
    const tickHistory: { seq: number; dt: number }[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const clampedDelta = Math.min(frameDeltaMs, MAX_ACCUMULATOR_MS);
      accumulator += clampedDelta;
      if (accumulator > MAX_ACCUMULATOR_MS) {
        accumulator = MAX_ACCUMULATOR_MS;
      }

      while (accumulator >= FIXED_TIMESTEP_MS) {
        accumulator -= FIXED_TIMESTEP_MS;
        sequenceNumber++;
        ticksExecuted++;
        tickHistory.push({ seq: sequenceNumber, dt: FIXED_TIMESTEP_SEC });
      }
    }

    return { ticksExecuted, finalAccumulator: accumulator, sequenceNumber, tickHistory };
  }

  it('executes exactly 20 ticks per second at 60 FPS (16.666ms delta)', () => {
    // 60 frames @ 16.66667 ms = 1000 ms -> exactly 20 ticks
    const result = simulateAccumulator(1000 / 60, 60);
    assert.strictEqual(result.ticksExecuted, 20);
    assert.strictEqual(result.sequenceNumber, 20);
    assert.ok(Math.abs(result.finalAccumulator) < 0.01);
    // Each tick must use strictly 0.050s
    for (const tick of result.tickHistory) {
      assert.strictEqual(tick.dt, 0.050);
    }
  });

  it('executes exactly 20 ticks per second at 30 FPS (33.333ms delta)', () => {
    // 30 frames @ 33.33333 ms = 1000 ms -> exactly 20 ticks
    const result = simulateAccumulator(1000 / 30, 30);
    assert.strictEqual(result.ticksExecuted, 20);
    assert.strictEqual(result.sequenceNumber, 20);
    assert.ok(Math.abs(result.finalAccumulator) < 0.01);
  });

  it('executes exactly 20 ticks per second at 120 FPS (8.333ms delta)', () => {
    // 120 frames @ 8.33333 ms = 1000 ms -> exactly 20 ticks
    const result = simulateAccumulator(1000 / 120, 120);
    assert.strictEqual(result.ticksExecuted, 20);
    assert.strictEqual(result.sequenceNumber, 20);
    assert.ok(Math.abs(result.finalAccumulator) < 0.01);
  });

  it('enforces bounded catch-up and drops excess time on 1500ms frame stall', () => {
    // A single stall frame of 1500ms (e.g. background tab)
    const result = simulateAccumulator(1500, 1);
    // Max accumulator is 250ms, so 250 / 50 = exactly 5 ticks
    assert.strictEqual(result.ticksExecuted, 5, 'Must clamp to at most 5 catch-up ticks');
    assert.strictEqual(result.sequenceNumber, 5);
    assert.strictEqual(result.finalAccumulator, 0);
  });

  it('generates strictly monotonic sequence numbers without duplicates', () => {
    const result = simulateAccumulator(16.67, 180); // 3 seconds at 60 FPS
    assert.strictEqual(result.ticksExecuted, 60);
    for (let i = 0; i < result.tickHistory.length; i++) {
      assert.strictEqual(result.tickHistory[i].seq, i + 1);
    }
  });
});

describe('Phase 4.3 Server-Synchronized HUD Race Timer Tests', () => {
  function simulateHUDTimer() {
    let raceElapsedTimeMs = 0;
    let isRaceActive = false;
    let lastServerTimeMs = 0;
    let lastServerTimeReceiptMs = 0;
    let displayedRaceTimeMs = 0;

    return {
      startRaceTimer(initialTimeMs: number = 0) {
        isRaceActive = true;
        raceElapsedTimeMs = initialTimeMs;
        lastServerTimeMs = initialTimeMs;
        lastServerTimeReceiptMs = 1000;
        displayedRaceTimeMs = initialTimeMs;
      },
      onServerSnapshot(serverTimeMs: number, arrivalReceiptMs: number) {
        if (serverTimeMs > lastServerTimeMs) {
          lastServerTimeMs = serverTimeMs;
          lastServerTimeReceiptMs = arrivalReceiptMs;
        }
      },
      updateDisplayFrame(frameDeltaMs: number, clientNow: number) {
        if (isRaceActive) {
          if (lastServerTimeReceiptMs > 0) {
            const extrapolatedTime = lastServerTimeMs + (clientNow - lastServerTimeReceiptMs);
            if (extrapolatedTime > displayedRaceTimeMs) {
              displayedRaceTimeMs = extrapolatedTime;
            }
          } else {
            displayedRaceTimeMs += frameDeltaMs;
          }
          if (displayedRaceTimeMs >= raceElapsedTimeMs) {
            raceElapsedTimeMs = displayedRaceTimeMs;
          }
        }
        return raceElapsedTimeMs;
      },
      getDisplayedTime() {
        return displayedRaceTimeMs;
      },
    };
  }

  it('initializes timer at 0:00.000 when race starts', () => {
    const timer = simulateHUDTimer();
    timer.startRaceTimer(0);
    assert.strictEqual(timer.getDisplayedTime(), 0);
  });

  it('extrapolates smoothly between 50ms snapshots using local monotonic delta', () => {
    const timer = simulateHUDTimer();
    timer.startRaceTimer(0);

    // Initial snapshot at t = 1000ms, server race time = 0ms
    timer.onServerSnapshot(0, 1000);

    // Render frame 1 @ 1016ms (+16ms)
    const t1 = timer.updateDisplayFrame(16, 1016);
    assert.strictEqual(t1, 16);

    // Render frame 2 @ 1033ms (+17ms)
    const t2 = timer.updateDisplayFrame(17, 1033);
    assert.strictEqual(t2, 33);

    // Render frame 3 @ 1050ms (+17ms), snapshot 2 arrives with serverTimeMs = 50ms
    timer.onServerSnapshot(50, 1050);
    const t3 = timer.updateDisplayFrame(17, 1050);
    assert.strictEqual(t3, 50);

    // Extrapolates further to 1066ms
    const t4 = timer.updateDisplayFrame(16, 1066);
    assert.strictEqual(t4, 66);
  });

  it('strictly preserves monotonicity when out-of-order or stale snapshots arrive', () => {
    const timer = simulateHUDTimer();
    timer.startRaceTimer(0);

    timer.onServerSnapshot(5000, 2000);
    const t1 = timer.updateDisplayFrame(16, 2016);
    assert.strictEqual(t1, 5016);

    // Stale snapshot with serverTimeMs = 4950 arrives at clientNow = 2020
    timer.onServerSnapshot(4950, 2020);
    const t2 = timer.updateDisplayFrame(16, 2032);
    // Must NOT jump back to 4950; must continue monotonically
    assert.ok(t2 >= 5016, `Timer must remain monotonic (was ${t1}, now ${t2})`);
    assert.strictEqual(t2, 5032);
  });
});
