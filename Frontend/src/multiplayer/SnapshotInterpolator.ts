/**
 * Nitro Rush — Remote Vehicle Snapshot Interpolator & Jitter Buffer
 *
 * Smooths incoming 20 Hz server telemetry snapshots for remote competitors using
 * a 100 ms interpolation delay buffer (2 server ticks), Hermite/linear positional
 * interpolation, shortest-arc angular slerp, and capped velocity dead-reckoning
 * extrapolation on packet loss or network jitter.
 */

import type { VehicleTelemetry } from './ProtocolTypes.ts';

export interface TimestampedSnapshot {
  telemetry: VehicleTelemetry;
  serverTimeMs: number;
  localArrivalTimeMs?: number;
}

export interface InterpolatedVehicleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  speedKMH: number;
  lap: number;
  nextCp: number;
  nitro: number;
  isDrifting: boolean;
  pos: number;
  status: string;
  isExtrapolated: boolean;
}

export interface SnapshotInterpolatorOptions {
  interpolationDelayMs?: number;
  initialDelayMs?: number;
  maxExtrapolationMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  adaptive?: boolean;
  jitterMultiplier?: number;
  growthRatePerSec?: number;
  shrinkRatePerSec?: number;
}

export class SnapshotInterpolator {
  private snapshots: TimestampedSnapshot[] = [];

  // Jitter Buffer Configuration & Bounds
  public static readonly DEFAULT_MIN_DELAY_MS: number = 60;
  public static readonly DEFAULT_MAX_DELAY_MS: number = 250;
  public static readonly DEFAULT_INITIAL_DELAY_MS: number = 100;

  public minDelayMs: number = SnapshotInterpolator.DEFAULT_MIN_DELAY_MS;
  public maxDelayMs: number = SnapshotInterpolator.DEFAULT_MAX_DELAY_MS;
  public initialDelayMs: number = SnapshotInterpolator.DEFAULT_INITIAL_DELAY_MS;
  public maxExtrapolationMs: number = 250;   // 5 ticks cap
  public adaptive: boolean = true;
  public jitterMultiplier: number = 2.0;
  public growthRatePerSec: number = 60; // ms/s slew rate for buffer expansion
  public shrinkRatePerSec: number = 15; // ms/s slew rate for buffer contraction

  // Dynamic Delay State
  public interpolationDelayMs: number = SnapshotInterpolator.DEFAULT_INITIAL_DELAY_MS;
  private currentDelayMs: number = SnapshotInterpolator.DEFAULT_INITIAL_DELAY_MS;
  private targetDelayMs: number = SnapshotInterpolator.DEFAULT_INITIAL_DELAY_MS;

  // Arrival & Jitter Measurement State
  private smoothedJitterMs: number = 0;
  private lastLocalArrivalTimeMs: number | null = null;
  private lastServerTimeMs: number | null = null;
  private arrivalCount: number = 0;
  private lastSampleTimeMs: number | null = null;
  private currentRttMs: number = 0;
  private smoothedRttMs: number = 0;

  // Monotonic client-to-server time offset mapping (serverTime - clientArrival)
  private serverTimeOffset: number | null = null;

  constructor(options?: SnapshotInterpolatorOptions) {
    const initialDelay = options?.initialDelayMs ?? options?.interpolationDelayMs;
    if (initialDelay !== undefined) {
      this.initialDelayMs = initialDelay;
      this.interpolationDelayMs = initialDelay;
      this.currentDelayMs = initialDelay;
      this.targetDelayMs = initialDelay;
    }
    if (options?.maxExtrapolationMs !== undefined) {
      this.maxExtrapolationMs = options.maxExtrapolationMs;
    }
    if (options?.minDelayMs !== undefined) {
      this.minDelayMs = options.minDelayMs;
    }
    if (options?.maxDelayMs !== undefined) {
      this.maxDelayMs = options.maxDelayMs;
    }
    if (options?.adaptive !== undefined) {
      this.adaptive = options.adaptive;
    }
    if (options?.jitterMultiplier !== undefined) {
      this.jitterMultiplier = options.jitterMultiplier;
    }
    if (options?.growthRatePerSec !== undefined) {
      this.growthRatePerSec = options.growthRatePerSec;
    }
    if (options?.shrinkRatePerSec !== undefined) {
      this.shrinkRatePerSec = options.shrinkRatePerSec;
    }
  }

  /**
   * Pushes a new telemetry snapshot from a RACE_STATE broadcast.
   * Maintains chronological ordering, synchronizes the server-to-client timebase mapping,
   * measures inter-arrival jitter, and purges snapshots older than 2 seconds.
   */
  public pushSnapshot(
    telemetry: VehicleTelemetry,
    serverTimeMs: number,
    localArrivalTimeMs?: number
  ): void {
    const entry: TimestampedSnapshot = { telemetry, serverTimeMs, localArrivalTimeMs };

    // Update server-to-client time mapping if local arrival time is provided
    if (localArrivalTimeMs !== undefined) {
      const instantaneousOffset = serverTimeMs - localArrivalTimeMs;
      if (this.serverTimeOffset === null) {
        // Initial clock synchronization on first snapshot arrival
        this.serverTimeOffset = instantaneousOffset;
      } else {
        const delta = instantaneousOffset - this.serverTimeOffset;
        if (Math.abs(delta) > 200) {
          // Large timing irregularity (e.g. initial connection hitch, GC stall, tab backgrounded) -> snap
          this.serverTimeOffset = instantaneousOffset;
        } else {
          // Smooth network arrival jitter via EMA filter (10% weight)
          this.serverTimeOffset += delta * 0.1;
        }
      }
    }

    // Ignore duplicate or out-of-order snapshots
    if (this.snapshots.length > 0) {
      const latest = this.snapshots[this.snapshots.length - 1];
      if (serverTimeMs < latest.serverTimeMs) {
        return;
      }
      if (serverTimeMs === latest.serverTimeMs) {
        this.snapshots[this.snapshots.length - 1] = entry;
        return;
      }
    }

    // Measure inter-arrival jitter (RFC 3550 transit delay variance)
    if (localArrivalTimeMs !== undefined) {
      if (this.lastLocalArrivalTimeMs !== null && this.lastServerTimeMs !== null) {
        const deltaArrival = localArrivalTimeMs - this.lastLocalArrivalTimeMs;
        const deltaServer = serverTimeMs - this.lastServerTimeMs;
        const transitDiff = deltaArrival - deltaServer;
        const instantaneousJitter = Math.abs(transitDiff);

        if (this.arrivalCount === 0) {
          this.smoothedJitterMs = instantaneousJitter;
        } else {
          // RFC 3550 EMA filter with 1/8 (0.125) smoothing weight
          this.smoothedJitterMs += (instantaneousJitter - this.smoothedJitterMs) * 0.125;
        }
      }
      this.lastLocalArrivalTimeMs = localArrivalTimeMs;
      this.lastServerTimeMs = serverTimeMs;
      this.arrivalCount++;
      this.recalculateTargetDelay();
    }

    this.snapshots.push(entry);

    // Evict snapshots older than 2 seconds before the latest
    const cutoff = serverTimeMs - 2000;
    while (this.snapshots.length > 2 && this.snapshots[0].serverTimeMs < cutoff) {
      this.snapshots.shift();
    }
  }

  /**
   * Recalculates target interpolation delay using smoothed jitter and network RTT.
   * Requires at least 5 snapshot arrivals before adapting away from initialDelayMs.
   */
  private recalculateTargetDelay(): void {
    if (!this.adaptive || this.arrivalCount < 5) {
      this.targetDelayMs = this.initialDelayMs;
      return;
    }

    // Base delay is 1 server tick (50ms)
    // Add jitter multiplier * smoothedJitterMs
    // Add fractional contribution for RTT when exceeding standard 60ms LAN threshold
    const rttBuffer = this.smoothedRttMs > 60 ? Math.min(60, (this.smoothedRttMs - 60) * 0.25) : 0;
    const computedTarget = 50 + this.jitterMultiplier * this.smoothedJitterMs + rttBuffer;

    this.targetDelayMs = Math.max(this.minDelayMs, Math.min(this.maxDelayMs, computedTarget));
  }

  /**
   * Samples the interpolated vehicle state at the specified timestamp.
   * If an arrival-based server time offset is active and isServerTime is false, maps
   * client monotonic render time into estimated server time prior to applying interpolation delay.
   */
  public sample(renderTimeMs: number, isServerTime: boolean = false): InterpolatedVehicleState | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    // Smoothly slew currentDelayMs towards targetDelayMs without visual snapping
    if (this.adaptive) {
      const dtSec = this.lastSampleTimeMs !== null
        ? Math.max(0, Math.min(0.1, (renderTimeMs - this.lastSampleTimeMs) / 1000))
        : 0.016;
      this.lastSampleTimeMs = renderTimeMs;

      if (this.currentDelayMs < this.targetDelayMs) {
        // Growth (expansion rate limited to growthRatePerSec, default 60 ms/s)
        this.currentDelayMs = Math.min(this.targetDelayMs, this.currentDelayMs + this.growthRatePerSec * dtSec);
      } else if (this.currentDelayMs > this.targetDelayMs) {
        // Contraction (decay rate limited to shrinkRatePerSec, default 15 ms/s)
        this.currentDelayMs = Math.max(this.targetDelayMs, this.currentDelayMs - this.shrinkRatePerSec * dtSec);
      }
      this.interpolationDelayMs = this.currentDelayMs;
    }

    const targetTime = (isServerTime || this.serverTimeOffset === null)
      ? renderTimeMs - this.interpolationDelayMs
      : (renderTimeMs + this.serverTimeOffset) - this.interpolationDelayMs;

    // Single snapshot: return directly
    if (this.snapshots.length === 1) {
      return this.toInterpolatedState(this.snapshots[0].telemetry, false);
    }

    const first = this.snapshots[0];
    const latest = this.snapshots[this.snapshots.length - 1];

    // Case 1: Target time is before the earliest snapshot
    if (targetTime <= first.serverTimeMs) {
      return this.toInterpolatedState(first.telemetry, false);
    }

    // Case 2: Target time is beyond the latest snapshot -> Dead Reckoning Extrapolation
    if (targetTime > latest.serverTimeMs) {
      return this.extrapolate(latest, targetTime);
    }

    // Case 3: Target time lies between two snapshots -> Hermite/Linear Interpolation
    for (let i = 0; i < this.snapshots.length - 1; i++) {
      const s1 = this.snapshots[i];
      const s2 = this.snapshots[i + 1];

      if (s1.serverTimeMs <= targetTime && targetTime <= s2.serverTimeMs) {
        const span = s2.serverTimeMs - s1.serverTimeMs;
        const alpha = span > 0 ? (targetTime - s1.serverTimeMs) / span : 0;
        return this.interpolate(s1.telemetry, s2.telemetry, alpha);
      }
    }

    return this.toInterpolatedState(latest.telemetry, false);
  }

  /**
   * Interpolates smoothly between two bounding snapshots.
   */
  private interpolate(
    t1: VehicleTelemetry,
    t2: VehicleTelemetry,
    alpha: number
  ): InterpolatedVehicleState {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));

    // Linear position and velocity blending
    const x = t1.x + (t2.x - t1.x) * clampedAlpha;
    const y = t1.y + (t2.y - t1.y) * clampedAlpha;
    const vx = t1.vx + (t2.vx - t1.vx) * clampedAlpha;
    const vy = t1.vy + (t2.vy - t1.vy) * clampedAlpha;

    // Shortest-arc angular slerp
    const angleDiff = this.shortestAngleDifference(t1.rot, t2.rot);
    const rotation = t1.rot + angleDiff * clampedAlpha;

    return {
      x,
      y,
      vx,
      vy,
      rotation,
      speedKMH: Math.round(t1.speedKMH + (t2.speedKMH - t1.speedKMH) * clampedAlpha),
      lap: t2.lap,
      nextCp: t2.nextCp,
      nitro: t2.nitro,
      isDrifting: t2.isDrifting,
      pos: t2.pos,
      status: t2.status,
      isExtrapolated: false,
    };
  }

  /**
   * Extrapolates position along velocity vector when server packets are delayed or dropped.
   * Clamped to maxExtrapolationMs to prevent runaway vehicles.
   */
  private extrapolate(
    latest: TimestampedSnapshot,
    targetTime: number
  ): InterpolatedVehicleState {
    const elapsedMs = targetTime - latest.serverTimeMs;
    const effectiveElapsedMs = Math.min(elapsedMs, this.maxExtrapolationMs);
    const dt = effectiveElapsedMs / 1000.0;

    // Drag decay applied during prolonged extrapolation (>100ms missing)
    const decay = elapsedMs > 100 ? Math.max(0, 1.0 - (elapsedMs - 100) / this.maxExtrapolationMs) : 1.0;
    const vx = latest.telemetry.vx * decay;
    const vy = latest.telemetry.vy * decay;

    const x = latest.telemetry.x + vx * dt;
    const y = latest.telemetry.y + vy * dt;

    return {
      x,
      y,
      vx,
      vy,
      rotation: latest.telemetry.rot,
      speedKMH: Math.round(latest.telemetry.speedKMH * decay),
      lap: latest.telemetry.lap,
      nextCp: latest.telemetry.nextCp,
      nitro: latest.telemetry.nitro,
      isDrifting: latest.telemetry.isDrifting,
      pos: latest.telemetry.pos,
      status: latest.telemetry.status,
      isExtrapolated: true,
    };
  }

  /**
   * Calculates the shortest angular difference between two radian angles in [-PI, PI].
   */
  private shortestAngleDifference(fromAngle: number, toAngle: number): number {
    let diff = (toAngle - fromAngle) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  private toInterpolatedState(t: VehicleTelemetry, isExtrapolated: boolean): InterpolatedVehicleState {
    return {
      x: t.x,
      y: t.y,
      vx: t.vx,
      vy: t.vy,
      rotation: t.rot,
      speedKMH: t.speedKMH,
      lap: t.lap,
      nextCp: t.nextCp,
      nitro: t.nitro,
      isDrifting: t.isDrifting,
      pos: t.pos,
      status: t.status,
      isExtrapolated,
    };
  }

  public getSnapshotCount(): number {
    return this.snapshots.length;
  }

  public getServerTimeOffset(): number | null {
    return this.serverTimeOffset;
  }

  public setServerTimeOffset(offset: number | null): void {
    this.serverTimeOffset = offset;
  }

  public clientToEstimatedServerTime(clientMonotonicMs: number): number {
    if (this.serverTimeOffset === null) {
      return clientMonotonicMs;
    }
    return clientMonotonicMs + this.serverTimeOffset;
  }

  public updateRtt(rttMs: number, smoothedRttMs?: number): void {
    this.currentRttMs = Math.max(0, rttMs);
    this.smoothedRttMs = smoothedRttMs !== undefined ? Math.max(0, smoothedRttMs) : this.currentRttMs;
    this.recalculateTargetDelay();
  }

  public getJitterMetrics(): {
    smoothedJitterMs: number;
    targetDelayMs: number;
    currentDelayMs: number;
    arrivalCount: number;
    minDelayMs: number;
    maxDelayMs: number;
  } {
    return {
      smoothedJitterMs: this.smoothedJitterMs,
      targetDelayMs: this.targetDelayMs,
      currentDelayMs: this.currentDelayMs,
      arrivalCount: this.arrivalCount,
      minDelayMs: this.minDelayMs,
      maxDelayMs: this.maxDelayMs,
    };
  }

  public setAdaptive(enabled: boolean): void {
    this.adaptive = enabled;
    if (!enabled) {
      this.currentDelayMs = this.initialDelayMs;
      this.targetDelayMs = this.initialDelayMs;
      this.interpolationDelayMs = this.initialDelayMs;
    }
  }

  public clear(): void {
    this.snapshots = [];
    this.serverTimeOffset = null;
    this.currentDelayMs = this.initialDelayMs;
    this.targetDelayMs = this.initialDelayMs;
    this.interpolationDelayMs = this.initialDelayMs;
    this.smoothedJitterMs = 0;
    this.lastLocalArrivalTimeMs = null;
    this.lastServerTimeMs = null;
    this.arrivalCount = 0;
    this.lastSampleTimeMs = null;
  }
}

