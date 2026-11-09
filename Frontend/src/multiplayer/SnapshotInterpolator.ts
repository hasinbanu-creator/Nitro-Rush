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

export class SnapshotInterpolator {
  private snapshots: TimestampedSnapshot[] = [];
  public interpolationDelayMs: number = 100; // 2 ticks at 20 Hz
  public maxExtrapolationMs: number = 250;   // 5 ticks cap

  constructor(options?: { interpolationDelayMs?: number; maxExtrapolationMs?: number }) {
    if (options?.interpolationDelayMs !== undefined) {
      this.interpolationDelayMs = options.interpolationDelayMs;
    }
    if (options?.maxExtrapolationMs !== undefined) {
      this.maxExtrapolationMs = options.maxExtrapolationMs;
    }
  }

  /**
   * Pushes a new telemetry snapshot from a RACE_STATE broadcast.
   * Maintains chronological ordering and purges snapshots older than 2 seconds.
   */
  public pushSnapshot(telemetry: VehicleTelemetry, serverTimeMs: number): void {
    const entry: TimestampedSnapshot = { telemetry, serverTimeMs };

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

    this.snapshots.push(entry);

    // Evict snapshots older than 2 seconds before the latest
    const cutoff = serverTimeMs - 2000;
    while (this.snapshots.length > 2 && this.snapshots[0].serverTimeMs < cutoff) {
      this.snapshots.shift();
    }
  }

  /**
   * Samples the interpolated vehicle state at the specified client display timestamp.
   * Applies the configured interpolation delay buffer (t_render = clientNowMs - delay).
   */
  public sample(renderTimeMs: number): InterpolatedVehicleState | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    const targetTime = renderTimeMs - this.interpolationDelayMs;

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

  public clear(): void {
    this.snapshots = [];
  }
}

