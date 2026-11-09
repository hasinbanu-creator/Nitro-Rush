/**
 * Nitro Rush — Client Prediction & Authoritative Server Reconciler
 *
 * Compares locally predicted vehicle states against authoritative server telemetry
 * snapshots received via RACE_STATE. Implements a three-tier reconciliation policy:
 * - Tier 1: Deadband (<4.0 px, <0.05 rad) -> zero correction applied.
 * - Tier 2: Soft Reconciliation (4.0 - 150 px) -> restore server state, replay unacknowledged
 *           inputs, and apply exponential visual decay smoothing over 4 frames.
 * - Tier 3: Hard Snap (>150 px) -> immediate position snap on violent collisions.
 */

import type { CarController } from '../game/CarController';
import type { CircuitTrack } from '../game/CircuitTrack';
import type { InputHistoryBuffer } from './InputHistoryBuffer';
import type { VehicleTelemetry } from './ProtocolTypes';

export type ReconciliationTier = 'DEADBAND' | 'SOFT_REPLAY' | 'HARD_SNAP';

export interface ReconcileResult {
  corrected: boolean;
  errorDist: number;
  errorAngle: number;
  tier: ReconciliationTier;
}

export class PredictionReconciler {
  public static readonly DEADBAND_DIST_PX = 4.0;
  public static readonly DEADBAND_ANGLE_RAD = 0.05;
  public static readonly HARD_SNAP_DIST_PX = 150.0;

  // Visual position offset for exponential decay smoothing (prevents visual pops)
  public visualOffsetX: number = 0;
  public visualOffsetY: number = 0;

  /**
   * Evaluates server snapshot divergence and executes deterministic reconciliation.
   */
  public reconcile(
    ackSeq: number,
    serverTelemetry: VehicleTelemetry,
    localCar: CarController,
    historyBuffer: InputHistoryBuffer,
    track: CircuitTrack
  ): ReconcileResult {
    const predictedFrame = historyBuffer.get(ackSeq);

    // Evict all acknowledged inputs up to ackSeq
    historyBuffer.acknowledge(ackSeq);

    if (!predictedFrame) {
      // Historical frame already evicted or not found; accept server telemetry directly
      return {
        corrected: false,
        errorDist: 0,
        errorAngle: 0,
        tier: 'DEADBAND',
      };
    }

    const predState = predictedFrame.stateSnapshot;
    const dx = serverTelemetry.x - predState.x;
    const dy = serverTelemetry.y - predState.y;
    const errorDist = Math.sqrt(dx * dx + dy * dy);

    const angleDiff = this.shortestAngleDifference(predState.rotation, serverTelemetry.rot);
    const errorAngle = Math.abs(angleDiff);

    // Tier 1: Deadband threshold — divergence is negligible
    if (errorDist < PredictionReconciler.DEADBAND_DIST_PX && errorAngle < PredictionReconciler.DEADBAND_ANGLE_RAD) {
      return {
        corrected: false,
        errorDist,
        errorAngle,
        tier: 'DEADBAND',
      };
    }

    const prevVisualX = localCar.x;
    const prevVisualY = localCar.y;

    // Reset physics model to authoritative server state at ackSeq
    localCar.x = serverTelemetry.x;
    localCar.y = serverTelemetry.y;
    localCar.vx = serverTelemetry.vx;
    localCar.vy = serverTelemetry.vy;
    localCar.rotation = serverTelemetry.rot;
    localCar.nitroAmount = serverTelemetry.nitro;

    const cosRot = Math.cos(serverTelemetry.rot);
    const sinRot = Math.sin(serverTelemetry.rot);
    localCar.forwardSpeed = serverTelemetry.vx * cosRot + serverTelemetry.vy * sinRot;
    localCar.lateralSpeed = serverTelemetry.vx * -sinRot + serverTelemetry.vy * cosRot;

    // Replay all remaining unacknowledged inputs forward through CarController physics
    const unackedInputs = historyBuffer.getUnacknowledged();
    const fixedDt = 0.050; // 50ms per 20 Hz tick

    for (const item of unackedInputs) {
      const isOnTrack = track.isPointOnTrack(localCar.x, localCar.y);
      localCar.update(
        fixedDt,
        item.input,
        false,
        isOnTrack,
        track.worldWidth,
        track.worldHeight,
        track.physics
      );

      // Refresh predicted snapshot in buffer
      item.stateSnapshot = {
        x: localCar.x,
        y: localCar.y,
        vx: localCar.vx,
        vy: localCar.vy,
        rotation: localCar.rotation,
        forwardSpeed: localCar.forwardSpeed,
        lateralSpeed: localCar.lateralSpeed,
        currentSpeedKMH: localCar.currentSpeedKMH,
        nitroAmount: localCar.nitroAmount,
        isDrifting: localCar.isDrifting,
        isReverseGear: localCar.isReverseGear,
      };
    }

    // Tier 2: Soft Reconciliation with visual smoothing blend
    if (errorDist <= PredictionReconciler.HARD_SNAP_DIST_PX) {
      this.visualOffsetX = prevVisualX - localCar.x;
      this.visualOffsetY = prevVisualY - localCar.y;

      return {
        corrected: true,
        errorDist,
        errorAngle,
        tier: 'SOFT_REPLAY',
      };
    }

    // Tier 3: Hard Snap — major collision or massive packet drop
    this.visualOffsetX = 0;
    this.visualOffsetY = 0;
    localCar.syncSprite();

    return {
      corrected: true,
      errorDist,
      errorAngle,
      tier: 'HARD_SNAP',
    };
  }

  /**
   * Decays the visual offset exponentially each display frame to eliminate rubberbanding.
   */
  public updateVisualSmoothing(localCar: CarController, decayFactor: number = 0.65): void {
    if (Math.abs(this.visualOffsetX) < 0.5 && Math.abs(this.visualOffsetY) < 0.5) {
      this.visualOffsetX = 0;
      this.visualOffsetY = 0;
      localCar.syncSprite();
      return;
    }

    this.visualOffsetX *= decayFactor;
    this.visualOffsetY *= decayFactor;

    if (localCar.sprite) {
      localCar.sprite.x = localCar.x + this.visualOffsetX;
      localCar.sprite.y = localCar.y + this.visualOffsetY;
      localCar.sprite.rotation = localCar.rotation + Math.PI / 2;
    }
  }

  private shortestAngleDifference(fromAngle: number, toAngle: number): number {
    let diff = (toAngle - fromAngle) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }
}

