import Phaser from 'phaser';
import type { CarConfig, NitroConfig, HandlingConfig } from '../data/CarData';
import { type TrackPhysicsConfig, WORLD_BORDER_MARGIN, WORLD_BORDER_RESTITUTION } from '../data/TrackData';
import type { DifficultyId } from '../state/SelectionState';

export interface CarInputState {
  throttle: number; // 0 to 1
  brake: number;    // 0 to 1
  steer: number;    // -1 (left) to 1 (right)
  drift: boolean;
  nitro: boolean;
}

export interface TirePosition {
  x: number;
  y: number;
}

export interface SkidMarkData {
  left: TirePosition;
  right: TirePosition;
  intensity: number; // 0 to 1
}

export class CarController {
  // Vehicle Position & Heading
  public x: number = 0;
  public y: number = 0;
  public rotation: number = 0; // heading angle in radians (0 = East, Math.PI/2 = South)

  // Velocity components in world space
  public vx: number = 0;
  public vy: number = 0;

  // Speeds
  public forwardSpeed: number = 0;
  public lateralSpeed: number = 0;
  public currentSpeedKMH: number = 0;

  // Transmission & Reverse State Machine
  public isReverseGear: boolean = false;
  private brakeHoldTimer: number = 0;
  private static readonly REVERSE_ENGAGE_THRESHOLD: number = 0.22; // 220ms hold while stopped to engage reverse
  private static readonly ZERO_SPEED_DEADZONE: number = 8.0; // px/s threshold for complete stop

  // Nitro System
  public nitroAmount: number = 100; // 0 to 100
  public maxNitro: number = 100;
  public isNitroActive: boolean = false;
  public nitroRegenRate: number = 8.5; // percent per second
  public nitroConsumeRate: number = 28.0; // percent per second

  // Drift State & Mini-Turbo System
  public isDrifting: boolean = false;
  public driftAngle: number = 0; // angle between heading and true velocity vector
  public driftAngleDeg: number = 0;
  public driftDuration: number = 0;
  private hasQualifyingSlip: boolean = false;
  public onMiniTurboAwarded?: (boostAmount: number) => void;

  // Scaled Performance Metrics from CarConfig
  public carConfig: CarConfig;
  public nitroConfig: NitroConfig;
  public handlingConfig: HandlingConfig;
  public massKg: number = 1250;
  public maxForwardSpeed: number;
  public maxReverseSpeed: number;
  public accelerationRate: number;
  public brakingRate: number;
  public turnRate: number;
  public nitroMultiplier: number;
  public nitroAccelMultiplier: number = 1.8;
  public dragCoefficient: number = 0.988;

  // Offsets for tires and exhaust (relative to car center)
  private readonly halfWidth: number = 18;
  private readonly rearAxleOffset: number = 26;
  private readonly exhaustOffset: number = 36;

  // Reference sprite for rendering sync
  public sprite: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    startX: number,
    startY: number,
    startAngle: number,
    carConfig: CarConfig,
    difficulty: DifficultyId
  ) {
    this.x = startX;
    this.y = startY;
    this.rotation = startAngle;
    this.carConfig = carConfig;
    this.nitroConfig = carConfig.nitroConfig;
    this.handlingConfig = carConfig.handlingConfig;
    this.massKg = carConfig.massKg || 1250;

    // Create the visual vehicle sprite (scaled appropriately for race track)
    this.sprite = scene.add.sprite(startX, startY, carConfig.textureKey);
    this.sprite.setScale(0.58);
    this.sprite.setDepth(10);
    this.syncSprite();

    // Calculate balanced vehicle dynamics based on car statistics (0-100)
    const stats = carConfig.stats;

    // Forward Speed: 360 to 715 px/s (translates to ~255 to 280 KM/H base)
    this.maxForwardSpeed = 360 + (stats.topSpeed / 100) * 355;
    this.maxReverseSpeed = this.maxForwardSpeed * 0.28;

    // Acceleration: 260 to 780 px/s²
    this.accelerationRate = 260 + (stats.acceleration / 100) * 520;

    // Weight-Sensitive Braking: Lighter vehicles brake sharper, heavier cars require more distance
    // Reference mass: 1250 KG
    const massFactor = Math.pow(1250 / this.massKg, 0.70);
    this.brakingRate = 840 * massFactor;

    // Steering turn rate: 2.1 to 3.55 rad/s
    this.turnRate = 2.1 + (stats.handling / 100) * 1.5;

    // Nitro power & consumption initialized from data-driven NitroConfig
    this.nitroMultiplier = this.nitroConfig.speedMultiplier;
    this.nitroAccelMultiplier = this.nitroConfig.accelMultiplier;
    this.nitroConsumeRate = this.nitroConfig.burnRate;
    this.nitroRegenRate = this.nitroConfig.regenRate;
    this.maxNitro = this.nitroConfig.maxCapacity;
    this.nitroAmount = this.maxNitro;

    // Apply difficulty bonuses
    if (difficulty === 'EASY') {
      this.nitroRegenRate *= 1.35; // +35% faster nitro recharge on Easy
      this.dragCoefficient = 0.990;
    } else if (difficulty === 'HARD') {
      this.nitroRegenRate *= 0.85; // Challenge nitro
      this.dragCoefficient = 0.985;
    }
  }

  /**
   * Main vehicle physics tick
   */
  public update(
    dt: number,
    inputs: CarInputState,
    isControlsLocked: boolean = false,
    isOnTrack: boolean = true,
    worldWidth: number = 3200,
    worldHeight: number = 2400,
    trackPhysics?: TrackPhysicsConfig
  ): void {
    const physics: TrackPhysicsConfig = trackPhysics || {
      gripMultiplier: 1.0,
      accelMultiplier: 1.0,
      brakingMultiplier: 1.0,
      offRoadPenalty: 0.65,
      offRoadDrag: 0.94,
      driftEaseFactor: 1.0,
      surfaceType: 'asphalt',
    };

    if (isControlsLocked) {
      // Natural rolling stop during countdown
      this.vx *= Math.pow(0.85, dt * 60);
      this.vy *= Math.pow(0.85, dt * 60);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.forwardSpeed = 0;
      this.lateralSpeed = 0;
      this.currentSpeedKMH = 0;
      this.syncSprite();
      return;
    }

    // 1. Heading vectors for orientation
    const prevFwdX = Math.cos(this.rotation);
    const prevFwdY = Math.sin(this.rotation);
    const prevRightX = -prevFwdY;
    const prevRightY = prevFwdX;

    // Current forward & lateral speeds in car reference frame prior to rotation
    let fwdSpeed = this.vx * prevFwdX + this.vy * prevFwdY;
    let latSpeed = this.vx * prevRightX + this.vy * prevRightY;

    // 2. Nitro Boost Logic
    if (inputs.nitro && this.nitroAmount > 0 && inputs.throttle > 0 && !this.isReverseGear) {
      this.isNitroActive = true;
      this.nitroAmount = Math.max(0, this.nitroAmount - this.nitroConsumeRate * dt);
    } else {
      this.isNitroActive = false;
      // Passive nitro regeneration when not boosting
      this.nitroAmount = Math.min(this.maxNitro, this.nitroAmount + this.nitroRegenRate * dt);
    }

    // Effective maximum forward speed and acceleration (penalized off-road, with AWD traction bonus)
    const offRoadTraction = this.handlingConfig.offRoadTractionBonus;
    const effectiveOffRoadPenalty = Math.min(1.0, physics.offRoadPenalty * offRoadTraction);

    const baseTargetMaxSpeed = this.isNitroActive
      ? this.maxForwardSpeed * this.nitroMultiplier
      : this.maxForwardSpeed;

    let currentMaxSpeed = baseTargetMaxSpeed;
    if (!isOnTrack) {
      const offRoadSpeedCap = this.maxForwardSpeed * effectiveOffRoadPenalty;
      currentMaxSpeed = Math.min(baseTargetMaxSpeed, offRoadSpeedCap);
    }

    const currentAccelRate = this.isNitroActive
      ? this.accelerationRate * this.nitroAccelMultiplier
      : (isOnTrack
          ? this.accelerationRate * physics.accelMultiplier
          : this.accelerationRate * physics.accelMultiplier * Math.min(1.0, 0.70 * offRoadTraction));

    // 3. Throttle, Braking & Transmission (Forward / Reverse State Machine)
    if (inputs.brake > 0) {
      if (fwdSpeed > CarController.ZERO_SPEED_DEADZONE) {
        // Active forward braking
        this.brakeHoldTimer = 0;
        this.isReverseGear = false;
        const effectiveBraking = this.brakingRate * physics.brakingMultiplier;
        fwdSpeed -= effectiveBraking * inputs.brake * dt;
        if (fwdSpeed < 0) {
          fwdSpeed = 0; // Clean deadstop: never overshoot into reverse during braking
        }
      } else if (!this.isReverseGear) {
        // Not in reverse gear: vehicle is bringing to standstill or stopped in deadzone
        fwdSpeed = 0;
        this.brakeHoldTimer += dt;
        // Must deliberately hold brake while stopped to engage reverse gear
        if (this.brakeHoldTimer >= CarController.REVERSE_ENGAGE_THRESHOLD) {
          this.isReverseGear = true;
          // Initial reverse acceleration step
          fwdSpeed -= (this.accelerationRate * 0.55) * inputs.brake * dt;
        }
      } else {
        // Already in reverse gear: allow continuous reverse acceleration up to maxReverseSpeed
        fwdSpeed -= (this.accelerationRate * 0.55) * inputs.brake * dt;
        if (fwdSpeed < -this.maxReverseSpeed) {
          fwdSpeed = -this.maxReverseSpeed;
        }
      }
    } else if (inputs.throttle > 0) {
      this.brakeHoldTimer = 0;
      if (this.isReverseGear || fwdSpeed < -CarController.ZERO_SPEED_DEADZONE) {
        // Applying throttle while reversing acts as brake to bring vehicle back to forward
        const effectiveBraking = this.brakingRate * physics.brakingMultiplier;
        fwdSpeed += effectiveBraking * inputs.throttle * dt;
        if (fwdSpeed >= 0) {
          fwdSpeed = 0;
          this.isReverseGear = false;
        }
      } else {
        this.isReverseGear = false;
        if (fwdSpeed < currentMaxSpeed) {
          fwdSpeed += currentAccelRate * inputs.throttle * dt;
          if (fwdSpeed > currentMaxSpeed) {
            fwdSpeed = currentMaxSpeed;
          }
        } else if (!isOnTrack && fwdSpeed > currentMaxSpeed) {
          // Smoothly bleed down excessive speed when entering off-road rather than immediate stop
          fwdSpeed -= 260 * dt;
          if (fwdSpeed < currentMaxSpeed) {
            fwdSpeed = currentMaxSpeed;
          }
        }
      }
    } else {
      // Coasting / idle rolling drag
      this.brakeHoldTimer = 0;
      const coastDrag = isOnTrack ? this.dragCoefficient : physics.offRoadDrag;
      fwdSpeed *= Math.pow(coastDrag, dt * 60);
      if (Math.abs(fwdSpeed) <= CarController.ZERO_SPEED_DEADZONE) {
        fwdSpeed = 0;
        this.isReverseGear = false;
      }
    }

    // 4. Steering Dynamics with Smooth Low-Speed Ease Curve and Drift Yaw Stabilization
    const currVx = fwdSpeed * prevFwdX + latSpeed * prevRightX;
    const currVy = fwdSpeed * prevFwdY + latSpeed * prevRightY;
    const totalSpeed = Math.sqrt(currVx * currVx + currVy * currVy);
    const minAgility = this.handlingConfig.lowSpeedAgility; // 0.35 to 0.50
    const speedRatio = Math.min(totalSpeed / 140, 1.0);
    const smoothEase = Math.sin((speedRatio * Math.PI) / 2); // 0 to 1 smooth ease-out
    const steerSpeedRatio = totalSpeed < 5 ? 0 : minAgility + (1.0 - minAgility) * smoothEase;

    const isDriftRequested = (inputs.drift || (physics.driftEaseFactor > 1.25 && Math.abs(inputs.steer) > 0.8 && totalSpeed > 140)) && totalSpeed > 90;

    // Drift yaw stabilization: prevents uncontrollable 70+ degree spinouts while allowing counter-steering
    let yawDamping = 1.0;
    if (isDriftRequested && this.driftAngleDeg > 24) {
      const isCounterSteer = (this.lateralSpeed * inputs.steer > 0);
      if (isCounterSteer) {
        yawDamping = 1.30; // High responsiveness when counter-steering out of drift
      } else {
        yawDamping = Math.max(0.10, 1.0 - (this.driftAngleDeg - 24) / 12); // Sweet-spot powerslide stabilization (26-34 deg)
      }
    }

    const effectiveTurnRate = isDriftRequested
      ? this.turnRate * this.handlingConfig.driftTurnMultiplier * physics.driftEaseFactor * yawDamping
      : this.turnRate * (isOnTrack ? Math.min(1.05, 0.95 + physics.gripMultiplier * 0.05) : 0.85);

    if (inputs.steer !== 0 && steerSpeedRatio > 0) {
      const reverseDir = fwdSpeed < 0 ? -1 : 1;
      this.rotation += inputs.steer * effectiveTurnRate * steerSpeedRatio * reverseDir * dt;
    }

    // 5. TRUE 2D LATERAL MOMENTUM AND DRIFT SLIP
    // Now project the world momentum into the newly rotated vehicle reference frame
    const newFwdX = Math.cos(this.rotation);
    const newFwdY = Math.sin(this.rotation);
    const newRightX = -newFwdY;
    const newRightY = newFwdX;

    // Decompose into the new chassis heading:
    // When the vehicle rotates, world-space velocity naturally splits into longitudinal and lateral components
    const projectedFwd = currVx * newFwdX + currVy * newFwdY;
    let projectedLat = currVx * newRightX + currVy * newRightY;

    // Apply lateral tire friction based on surface grip, vehicle handling, and drift state
    const surfaceGrip = isOnTrack ? physics.gripMultiplier : (physics.gripMultiplier * 0.82);
    const baseGrip = this.handlingConfig.baseLateralGrip;
    const driftRetention = this.handlingConfig.driftGripRetention;

    // Drift mode reduces lateral friction while retaining controlled slip
    const lateralGripFactor = isDriftRequested
      ? Math.min(0.97, driftRetention + (1.0 - surfaceGrip) * 0.08)
      : Math.max(0.70, Math.min(0.90, baseGrip + (1.0 - surfaceGrip) * 0.35));

    projectedLat *= Math.pow(lateralGripFactor, dt * 60);
    if (Math.abs(projectedLat) < 2) {
      projectedLat = 0;
    }

    // Assign final speed components
    this.forwardSpeed = projectedFwd;
    this.lateralSpeed = projectedLat;

    // Calculate drift angle and active drift state
    this.driftAngle = Math.atan2(this.lateralSpeed, Math.max(20, Math.abs(this.forwardSpeed)));
    this.driftAngleDeg = Math.abs(this.driftAngle * (180 / Math.PI));

    const isCurrentlySlipping = Math.abs(this.lateralSpeed) > 45 || this.driftAngleDeg >= 12;
    this.isDrifting = (isDriftRequested && totalSpeed > 100) || (isCurrentlySlipping && totalSpeed > 100);

    // 6. Drift-to-Nitro Mini-Turbo Reward System
    if (this.isDrifting && totalSpeed > 100) {
      this.driftDuration += dt;
      if (isCurrentlySlipping && this.driftDuration >= 0.35) {
        this.hasQualifyingSlip = true;
      }
    } else {
      // Exiting drift or returning to traction line
      if (this.hasQualifyingSlip && this.driftDuration >= 0.55 && totalSpeed > 90 && this.driftAngleDeg < 12) {
        // Clean drift recovery executed: award +15% Mini-Turbo boost!
        const rewardAmount = 15;
        this.nitroAmount = Math.min(this.maxNitro, this.nitroAmount + rewardAmount);
        if (this.onMiniTurboAwarded) {
          this.onMiniTurboAwarded(rewardAmount);
        }
      }
      this.driftDuration = 0;
      this.hasQualifyingSlip = false;
    }

    // Cancel mini-turbo if vehicle stalls or crashes to near stop
    if (totalSpeed < 50) {
      this.driftDuration = 0;
      this.hasQualifyingSlip = false;
    }

    // 7. Reconstruct World Velocity
    this.vx = this.forwardSpeed * newFwdX + this.lateralSpeed * newRightX;
    this.vy = this.forwardSpeed * newFwdY + this.lateralSpeed * newRightY;

    // Apply natural friction / aerodynamic drag (higher top speed allowed under nitro)
    const effectiveDrag = isOnTrack
      ? (this.isNitroActive ? Math.min(0.993, this.dragCoefficient + 0.004) : this.dragCoefficient)
      : physics.offRoadDrag;
    this.vx *= Math.pow(effectiveDrag, dt * 60);
    this.vy *= Math.pow(effectiveDrag, dt * 60);

    // Re-sync forwardSpeed and lateralSpeed after drag
    this.forwardSpeed = this.vx * newFwdX + this.vy * newFwdY;
    this.lateralSpeed = this.vx * newRightX + this.vy * newRightY;

    // 8. Update Position & Enforce World Boundaries
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < WORLD_BORDER_MARGIN) {
      this.x = WORLD_BORDER_MARGIN;
      this.vx = Math.abs(this.vx) * WORLD_BORDER_RESTITUTION;
    } else if (this.x > worldWidth - WORLD_BORDER_MARGIN) {
      this.x = worldWidth - WORLD_BORDER_MARGIN;
      this.vx = -Math.abs(this.vx) * WORLD_BORDER_RESTITUTION;
    }
    if (this.y < WORLD_BORDER_MARGIN) {
      this.y = WORLD_BORDER_MARGIN;
      this.vy = Math.abs(this.vy) * WORLD_BORDER_RESTITUTION;
    } else if (this.y > worldHeight - WORLD_BORDER_MARGIN) {
      this.y = worldHeight - WORLD_BORDER_MARGIN;
      this.vy = -Math.abs(this.vy) * WORLD_BORDER_RESTITUTION;
    }

    // 9. Calculate HUD Speed in KM/H (1 px/s ≈ 0.40 KM/H)
    const currentSpeedPixels = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.currentSpeedKMH = Math.round(currentSpeedPixels * 0.40);

    // 10. Sync visual sprite
    this.syncSprite();
  }

  /**
   * Synchronizes visual sprite position and rotation with physics model.
   * Note: The procedural car texture is drawn vertically (facing up, -Y),
   * so rotation angle 0 (East, +X) corresponds to visual rotation of +Math.PI / 2.
   */
  public syncSprite(): void {
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    this.sprite.rotation = this.rotation + Math.PI / 2;
  }

  /**
   * Returns world coordinates of rear tires for skid mark and smoke generation
   */
  public getRearTireWorldPositions(): SkidMarkData | null {
    if (!this.isDrifting && Math.abs(this.lateralSpeed) < 45 && this.driftAngleDeg < 8) {
      return null;
    }

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rightX = -sin;
    const rightY = cos;

    // Rear axle center point in world space
    const axleX = this.x - cos * this.rearAxleOffset;
    const axleY = this.y - sin * this.rearAxleOffset;

    // Left and right rear tires
    const left = {
      x: axleX - rightX * this.halfWidth,
      y: axleY - rightY * this.halfWidth,
    };
    const right = {
      x: axleX + rightX * this.halfWidth,
      y: axleY + rightY * this.halfWidth,
    };

    const intensity = Math.min(
      1.0,
      (Math.abs(this.lateralSpeed) / 160) + (this.isDrifting ? 0.35 : 0)
    );

    return { left, right, intensity };
  }

  /**
   * Returns world coordinates of dual exhaust ports for nitro and flame particles
   */
  public getExhaustWorldPositions(): { left: TirePosition; right: TirePosition } {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rightX = -sin;
    const rightY = cos;

    const tailX = this.x - cos * this.exhaustOffset;
    const tailY = this.y - sin * this.exhaustOffset;

    const exhaustSpread = 7;
    return {
      left: {
        x: tailX - rightX * exhaustSpread,
        y: tailY - rightY * exhaustSpread,
      },
      right: {
        x: tailX + rightX * exhaustSpread,
        y: tailY + rightY * exhaustSpread,
      },
    };
  }

  /**
   * Instantly re-positions the vehicle (e.g. starting grid reset)
   */
  public setPosition(x: number, y: number, angle: number): void {
    this.x = x;
    this.y = y;
    this.rotation = angle;
    this.vx = 0;
    this.vy = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.currentSpeedKMH = 0;
    this.isReverseGear = false;
    this.brakeHoldTimer = 0;
    this.driftDuration = 0;
    this.hasQualifyingSlip = false;
    this.syncSprite();
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}


