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
});
