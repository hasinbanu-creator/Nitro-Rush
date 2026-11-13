/**
 * Nitro Rush — Phase 4.4 Adaptive Jitter Buffer & Multi-Client Resilience Tests
 *
 * Verifies:
 * 1. Adaptive delay calculation from snapshot inter-arrival jitter (RFC 3550) and RTT.
 * 2. Delay stability under changing RTT and hysteresis preventing visual jumps/oscillations.
 * 3. Safe enforcement of minimum (60ms) and maximum (250ms) interpolation delay bounds.
 * 4. Graceful handling of initial synchronization and insufficient network samples (<5 arrivals).
 * 5. Out-of-order, duplicate, delayed, burst, and dropped snapshot handling.
 * 6. Bounded extrapolation (250ms cap) with velocity drag decay during packet loss.
 * 7. Recovery after temporary network stalls and disconnections.
 * 8. Multi-client simulation matrix: 2-, 4-, and 8-client scenarios across variable latency/loss/jitter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SnapshotInterpolator, type TimestampedSnapshot } from '../../src/multiplayer/SnapshotInterpolator.ts';
import type { VehicleTelemetry } from '../../src/multiplayer/ProtocolTypes.ts';

function createMockTelemetry(id: string, x: number, y: number, vx: number = 0, vy: number = 0, rot: number = 0): VehicleTelemetry {
  return {
    id,
    x,
    y,
    vx,
    vy,
    rot,
    speedKMH: Math.round(Math.hypot(vx, vy) * 0.1),
    lap: 1,
    nextCp: 1,
    nitro: 100,
    isDrifting: false,
    pos: 1,
    status: 'RACING',
  };
}

describe('Phase 4.4 Adaptive Jitter Buffer Unit Tests', () => {
  it('initializes with default bounds and begins at initialDelayMs', () => {
    const interpolator = new SnapshotInterpolator();
    const metrics = interpolator.getJitterMetrics();

    assert.strictEqual(interpolator.minDelayMs, 60);
    assert.strictEqual(interpolator.maxDelayMs, 250);
    assert.strictEqual(interpolator.initialDelayMs, 100);
    assert.strictEqual(interpolator.interpolationDelayMs, 100);
    assert.strictEqual(metrics.currentDelayMs, 100);
    assert.strictEqual(metrics.targetDelayMs, 100);
    assert.strictEqual(metrics.arrivalCount, 0);
  });

  it('keeps delay at initialDelayMs during initial synchronization (< 5 samples)', () => {
    const interpolator = new SnapshotInterpolator();

    // Push 4 jittered snapshots (inter-arrival varying wildly)
    for (let i = 0; i < 4; i++) {
      const serverTime = i * 50;
      const arrivalTime = 1000 + i * 50 + (i % 2 === 1 ? 30 : -20);
      interpolator.pushSnapshot(createMockTelemetry('p2', 100 + i * 5, 200), serverTime, arrivalTime);
    }

    const metrics = interpolator.getJitterMetrics();
    assert.strictEqual(metrics.arrivalCount, 4);
    assert.strictEqual(metrics.targetDelayMs, 100, 'Must remain at initial 100ms before 5 samples');
  });

  it('adapts target delay dynamically based on inter-arrival jitter after 5 samples', () => {
    const interpolator = new SnapshotInterpolator();

    // Feed 10 snapshots with simulated 25ms jitter (alternating +/- 25ms local transit delay)
    let arrivalTime = 1000;
    for (let i = 0; i < 10; i++) {
      const serverTime = i * 50;
      const jitterOffset = (i % 2 === 0) ? 25 : -25;
      arrivalTime = 1000 + i * 50 + jitterOffset;
      interpolator.pushSnapshot(createMockTelemetry('p2', 100 + i * 5, 200), serverTime, arrivalTime);
    }

    const metrics = interpolator.getJitterMetrics();
    assert.strictEqual(metrics.arrivalCount, 10);
    assert.ok(metrics.smoothedJitterMs > 10, `Smoothed jitter should be captured, got ${metrics.smoothedJitterMs}`);
    // Target delay must expand above 100ms: 50 + 2.0 * smoothedJitter
    assert.ok(metrics.targetDelayMs > 100, `Target delay must expand with jitter, got ${metrics.targetDelayMs}`);
    assert.ok(metrics.targetDelayMs <= 250, 'Target delay must not exceed max bound');
  });

  it('enforces strict minimum (60ms) and maximum (250ms) delay bounds', () => {
    // 1. Minimum bound test under zero jitter and zero latency
    const interpolatorLow = new SnapshotInterpolator({ minDelayMs: 60, maxDelayMs: 250 });
    for (let i = 0; i < 15; i++) {
      // Perfect 50ms clock with 0 jitter
      interpolatorLow.pushSnapshot(createMockTelemetry('p2', i * 10, 0), i * 50, 1000 + i * 50);
    }
    const metricsLow = interpolatorLow.getJitterMetrics();
    assert.ok(metricsLow.targetDelayMs >= 60, `Target delay must be >= 60ms, got ${metricsLow.targetDelayMs}`);

    // 2. Maximum bound test under extreme network jitter
    const interpolatorHigh = new SnapshotInterpolator({ minDelayMs: 60, maxDelayMs: 250 });
    for (let i = 0; i < 15; i++) {
      // Extreme jitter of +/- 200ms
      const arrival = 1000 + i * 50 + ((i % 2 === 0) ? 200 : -100);
      interpolatorHigh.pushSnapshot(createMockTelemetry('p2', i * 10, 0), i * 50, arrival);
    }
    interpolatorHigh.updateRtt(400, 350); // High RTT
    const metricsHigh = interpolatorHigh.getJitterMetrics();
    assert.strictEqual(metricsHigh.targetDelayMs, 250, 'Target delay must clamp at maximum 250ms');
  });

  it('slews delay smoothly across render frames without visual pops or teleports', () => {
    const interpolator = new SnapshotInterpolator({
      growthRatePerSec: 60,
      shrinkRatePerSec: 15,
      initialDelayMs: 100,
    });

    // Provide 8 snapshots with high jitter causing targetDelayMs to jump to ~130ms
    interpolator.updateRtt(150, 150);
    for (let i = 0; i < 8; i++) {
      const serverTime = i * 50;
      const arrivalTime = 1000 + i * 50 + (i % 2 === 1 ? 60 : -20);
      interpolator.pushSnapshot(createMockTelemetry('p2', 100 + i * 10, 200), serverTime, arrivalTime);
    }

    const initialMetrics = interpolator.getJitterMetrics();
    assert.ok(initialMetrics.targetDelayMs > 120, `Target delay must expand with high jitter, got ${initialMetrics.targetDelayMs}`);

    // Initial sample: currentDelayMs should start at 100ms
    assert.strictEqual(interpolator.interpolationDelayMs, 100);

    // Step 1 display frame at 60 FPS (~16.6ms)
    interpolator.sample(1016.6, false);
    const d1 = interpolator.interpolationDelayMs;
    // Growth rate: 60 ms/s -> ~1.0ms growth per frame
    assert.ok(d1 > 100 && d1 <= 101.5, `Frame 1 delay should grow smoothly, got ${d1}`);

    // Step 30 display frames (~500ms)
    for (let f = 2; f <= 30; f++) {
      interpolator.sample(1000 + f * 16.666, false);
    }
    const d30 = interpolator.interpolationDelayMs;
    // Should have grown by ~30ms (reaching ~130ms or capped by target) without sudden snapping
    assert.ok(d30 > 115 && d30 <= initialMetrics.targetDelayMs + 0.1);
  });

  it('exhibits asymmetric decay (slow contraction) to avoid unstable delay oscillation', () => {
    const interpolator = new SnapshotInterpolator({
      growthRatePerSec: 60,
      shrinkRatePerSec: 15,
      initialDelayMs: 140, // Pre-expanded delay
    });

    // Feed stable snapshots with zero jitter (target will want to contract)
    for (let i = 0; i < 10; i++) {
      interpolator.pushSnapshot(createMockTelemetry('p2', i * 10, 0), i * 50, 1000 + i * 50);
    }

    const metrics = interpolator.getJitterMetrics();
    assert.ok(metrics.targetDelayMs < 100, `Target wants to shrink, got ${metrics.targetDelayMs}`);

    // Simulate 1 second of render frames (60 frames @ 16.666ms)
    for (let f = 1; f <= 60; f++) {
      interpolator.sample(1000 + f * 16.666, false);
    }

    const delayAfter1s = interpolator.interpolationDelayMs;
    // With shrinkRatePerSec = 15, delay should drop by at most ~15ms in 1s (from 140 to ~125)
    assert.ok(delayAfter1s >= 120 && delayAfter1s <= 128, `Delayed contraction must be conservative (was 140, now ${delayAfter1s})`);
  });

  it('incorporates network RTT measurements from NetworkManager into target delay', () => {
    const interpolator = new SnapshotInterpolator();

    // Baseline snapshots
    for (let i = 0; i < 6; i++) {
      interpolator.pushSnapshot(createMockTelemetry('p2', i * 10, 0), i * 50, 1000 + i * 50);
    }
    const baselineTarget = interpolator.getJitterMetrics().targetDelayMs;

    // Report network latency increase (e.g. 180ms RTT)
    interpolator.updateRtt(180, 180);
    const highRttTarget = interpolator.getJitterMetrics().targetDelayMs;

    assert.ok(highRttTarget > baselineTarget, `Higher RTT must expand target delay (baseline ${baselineTarget}, high RTT ${highRttTarget})`);
    assert.ok(highRttTarget <= 250);
  });

  it('disables adaptation cleanly when adaptive is set to false', () => {
    const interpolator = new SnapshotInterpolator({ adaptive: false, interpolationDelayMs: 110 });

    for (let i = 0; i < 10; i++) {
      interpolator.pushSnapshot(createMockTelemetry('p2', i * 10, 0), i * 50, 1000 + i * 50 + (i % 2 === 1 ? 50 : -30));
    }

    interpolator.sample(1050, false);
    assert.strictEqual(interpolator.interpolationDelayMs, 110, 'Delay must remain fixed when adaptive=false');
  });
});

describe('Phase 4.4 Network Resilience & Packet Condition Tests', () => {
  it('handles duplicate snapshots without corrupting chronological ordering', () => {
    const interpolator = new SnapshotInterpolator();

    interpolator.pushSnapshot(createMockTelemetry('p2', 100, 200), 100, 1000);
    interpolator.pushSnapshot(createMockTelemetry('p2', 105, 200), 150, 1050);
    // Duplicate snapshot with same serverTimeMs 150 but updated position 106
    interpolator.pushSnapshot(createMockTelemetry('p2', 106, 200), 150, 1051);

    assert.strictEqual(interpolator.getSnapshotCount(), 2, 'Duplicate snapshot must overwrite latest, not create duplicate');
    // Sample state at targetTime 150 (renderTime 250 with delay 100) should reflect updated snapshot
    const sample = interpolator.sample(250, true);
    assert.strictEqual(sample?.x, 106);
  });

  it('safely drops out-of-order stale snapshots', () => {
    const interpolator = new SnapshotInterpolator();

    interpolator.pushSnapshot(createMockTelemetry('p2', 100, 200), 100, 1000);
    interpolator.pushSnapshot(createMockTelemetry('p2', 110, 200), 200, 1100);
    // Stale snapshot with serverTimeMs 150 arrives late
    interpolator.pushSnapshot(createMockTelemetry('p2', 105, 200), 150, 1110);

    assert.strictEqual(interpolator.getSnapshotCount(), 2, 'Stale snapshot must be dropped');
  });

  it('caps dead-reckoning extrapolation at maxExtrapolationMs (250ms) during packet loss', () => {
    const interpolator = new SnapshotInterpolator({ maxExtrapolationMs: 250, interpolationDelayMs: 100 });
    // Car moving at vx = 100 px/s with 2 snapshots
    interpolator.pushSnapshot(createMockTelemetry('p2', 50, 200, 100, 0), 950, 950);
    interpolator.pushSnapshot(createMockTelemetry('p2', 100, 200, 100, 0), 1000, 1000);

    // Target time is 1500ms (500ms after latest snapshot, well exceeding 250ms cap)
    const state = interpolator.sample(1600, true); // 1600 - 100 = 1500ms
    assert.ok(state !== null);
    assert.strictEqual(state.isExtrapolated, true);

    // Position must be bounded to at most 250ms extrapolation:
    // With max 250ms (0.25s), max displacement is <= 100 * 0.25 = 25px
    assert.ok(state.x <= 125.1, `Position must be capped by maxExtrapolationMs, got x: ${state.x}`);
    assert.ok(state.x >= 100.0);
  });

  it('recovers cleanly from a temporary network stall when snapshot burst arrives', () => {
    const interpolator = new SnapshotInterpolator();

    // 1. Initial snapshots establishing baseline
    interpolator.pushSnapshot(createMockTelemetry('p2', 80, 100, 50, 0), 0, 1000);
    interpolator.pushSnapshot(createMockTelemetry('p2', 100, 100, 50, 0), 50, 1050);

    // 2. 300ms network stall occurs -> interpolator extrapolates safely
    const stallState = interpolator.sample(1300, false);
    assert.ok(stallState !== null);
    assert.strictEqual(stallState.isExtrapolated, true);

    // 3. Network recovers and a burst of 6 snapshots arrives in rapid succession
    for (let i = 2; i <= 7; i++) {
      const serverTime = i * 50;
      const burstArrival = 1350 + i * 2; // Arriving 2ms apart in a burst
      interpolator.pushSnapshot(createMockTelemetry('p2', 100 + i * 5, 100, 50, 0), serverTime, burstArrival);
    }

    assert.strictEqual(interpolator.getSnapshotCount(), 8);
    // After burst, interpolator resumes smooth continuous interpolation (isExtrapolated: false)
    const recoveredState = interpolator.sample(1360, false);
    assert.ok(recoveredState !== null);
    assert.strictEqual(recoveredState.isExtrapolated, false);
  });
});

describe('Phase 4.4 Multi-Client Network Stress Matrix (2-, 4-, 8-Clients)', () => {
  interface ClientSimulator {
    id: string;
    slot: string;
    interpolator: SnapshotInterpolator;
    receivedSnapshots: number;
    extrapolationEvents: number;
  }

  function runMultiClientSimulation(options: {
    clientCount: number;
    durationSeconds: number;
    baseLatencyMs: number;
    jitterRangeMs: number;
    packetLossRatio: number;
  }) {
    const clients: ClientSimulator[] = [];
    for (let c = 1; c <= options.clientCount; c++) {
      const interpolator = new SnapshotInterpolator({
        growthRatePerSec: 60,
        shrinkRatePerSec: 15,
      });
      // Feed estimated RTT (2 * one-way base latency)
      interpolator.updateRtt(options.baseLatencyMs * 2, options.baseLatencyMs * 2);

      clients.push({
        id: `p${c}`,
        slot: `P${c}`,
        interpolator,
        receivedSnapshots: 0,
        extrapolationEvents: 0,
      });
    }

    const totalServerTicks = options.durationSeconds * 20; // 20 TPS

    for (let tick = 0; tick < totalServerTicks; tick++) {
      const serverTimeMs = tick * 50;

      // Broadcast server snapshot to all clients
      for (const client of clients) {
        // Simulate packet loss
        const isLost = Math.random() < options.packetLossRatio;
        if (isLost) continue;

        // Simulated network transmission delay
        const jitter = (Math.random() * 2 - 1) * options.jitterRangeMs;
        const transitDelay = Math.max(5, options.baseLatencyMs + jitter);
        const arrivalTimeMs = 1000 + serverTimeMs + transitDelay;

        client.interpolator.pushSnapshot(
          createMockTelemetry(client.id, 100 + tick * 2, 200, 40, 0),
          serverTimeMs,
          arrivalTimeMs
        );
        client.receivedSnapshots++;
      }

      // Render frames at 60 FPS (approx 3 frames per server tick)
      for (let f = 0; f < 3; f++) {
        const renderTimeMs = 1000 + serverTimeMs + f * 16.666;
        for (const client of clients) {
          const sample = client.interpolator.sample(renderTimeMs, false);
          if (sample && sample.isExtrapolated) {
            client.extrapolationEvents++;
          }
        }
      }
    }

    return clients;
  }

  it('2-player scenario under low latency & low jitter (LAN/Broadband: 15ms base, +/-5ms jitter, 0% loss)', () => {
    const clients = runMultiClientSimulation({
      clientCount: 2,
      durationSeconds: 3,
      baseLatencyMs: 15,
      jitterRangeMs: 5,
      packetLossRatio: 0.0,
    });

    for (const c of clients) {
      assert.strictEqual(c.receivedSnapshots, 60, 'All 60 snapshots must be received under 0% loss');
      assert.strictEqual(c.extrapolationEvents, 0, 'No extrapolation events on stable low-latency connection');
      const metrics = c.interpolator.getJitterMetrics();
      // Should remain within safe bounds
      assert.ok(metrics.currentDelayMs >= 60 && metrics.currentDelayMs <= 120);
    }
  });

  it('4-player scenario under typical Internet conditions (100ms base latency, +/-25ms jitter, 5% packet loss)', () => {
    const clients = runMultiClientSimulation({
      clientCount: 4,
      durationSeconds: 3,
      baseLatencyMs: 100,
      jitterRangeMs: 25,
      packetLossRatio: 0.05,
    });

    for (const c of clients) {
      assert.ok(c.receivedSnapshots >= 50, `Expected at least 50/60 snapshots under 5% loss, got ${c.receivedSnapshots}`);
      const metrics = c.interpolator.getJitterMetrics();
      assert.ok(metrics.smoothedJitterMs > 5, 'Jitter should be detected and measured');
      assert.ok(metrics.targetDelayMs >= 70 && metrics.targetDelayMs <= 250);
    }
  });

  it('8-player full grid scenario under high latency & harsh jitter (200ms base latency, +/-50ms jitter, 10% packet loss)', () => {
    const clients = runMultiClientSimulation({
      clientCount: 8,
      durationSeconds: 3,
      baseLatencyMs: 200,
      jitterRangeMs: 50,
      packetLossRatio: 0.10,
    });

    assert.strictEqual(clients.length, 8);
    for (const c of clients) {
      assert.ok(c.receivedSnapshots >= 45, `Expected at least 45/60 snapshots under 10% loss, got ${c.receivedSnapshots}`);
      const metrics = c.interpolator.getJitterMetrics();
      // Under harsh jitter, the adaptive buffer should expand to provide safety
      assert.ok(metrics.targetDelayMs >= 100, `Delay must expand under harsh conditions, got ${metrics.targetDelayMs}`);
      assert.ok(metrics.targetDelayMs <= 250, 'Delay must strictly enforce 250ms upper bound');
    }
  });
});
