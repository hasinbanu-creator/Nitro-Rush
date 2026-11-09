import Phaser from 'phaser';
import type { CarConfig } from '../data/CarData';
import { WORLD_BORDER_MARGIN, WORLD_BORDER_RESTITUTION } from '../data/TrackData';
import type { DifficultyId } from '../state/SelectionState';
import type { CircuitTrack } from './CircuitTrack';

export type AIPersonality = 'speed_demon' | 'aggressive' | 'defensive';

export interface VehicleCollisionData {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isPlayer: boolean;
  radius: number;
}

export class AIController {
  public id: string;
  public name: string;
  public personality: AIPersonality;
  public carConfig: CarConfig;
  public difficulty: DifficultyId;

  // World Transform
  public x: number = 0;
  public y: number = 0;
  public rotation: number = 0;

  // Velocity components
  public vx: number = 0;
  public vy: number = 0;
  public forwardSpeed: number = 0;
  public lateralSpeed: number = 0;
  public currentSpeedKMH: number = 0;

  // Performance Limits (derived from CarConfig & Difficulty)
  public massKg: number = 1250;
  public maxForwardSpeed: number = 550;
  public accelerationRate: number = 450;
  public brakingRate: number = 750;
  public turnRate: number = 2.8;
  public dragCoefficient: number = 0.988;
  public collisionRadius: number = 24;

  // Nitro System
  public nitroAmount: number = 100;
  public maxNitro: number = 100;
  public isNitroActive: boolean = false;
  private nitroMultiplier: number = 1.35;
  private nitroConsumeRate: number = 26;
  private nitroRegenRate: number = 8.0;
  private nitroCooldown: number = 0;

  // Drift State
  public isDrifting: boolean = false;
  public driftAngle: number = 0;

  // Path Tracking
  public currentWaypointIndex: number = 0;
  private lateralOffset: number = 0;
  private targetOffset: number = 0;

  // Visuals
  public sprite: Phaser.GameObjects.Sprite;
  private exhaustEmitterLeft?: Phaser.GameObjects.Particles.ParticleEmitter;
  private exhaustEmitterRight?: Phaser.GameObjects.Particles.ParticleEmitter;
  private tireSmokeEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Difficulty Multipliers
  private speedMultiplier: number = 1.0;
  private steerResponsiveness: number = 1.0;
  private lookaheadPoints: number = 12;
  private nitroAggression: number = 0.6;
  private overtakeTendency: number = 0.6;

  constructor(
    scene: Phaser.Scene,
    id: string,
    name: string,
    startX: number,
    startY: number,
    startAngle: number,
    carConfig: CarConfig,
    personality: AIPersonality,
    difficulty: DifficultyId
  ) {
    this.id = id;
    this.name = name;
    this.personality = personality;
    this.carConfig = carConfig;
    this.difficulty = difficulty;

    this.x = startX;
    this.y = startY;
    this.rotation = startAngle;

    // Create visual sprite
    this.sprite = scene.add.sprite(startX, startY, carConfig.textureKey);
    this.sprite.setScale(0.58);
    this.sprite.setDepth(9);
    this.syncSprite();

    // Setup visual particle FX
    this.setupParticles(scene);

    // Apply baseline car statistics
    this.applyCarStatistics();

    // Apply personality & difficulty parameters
    this.applyPersonalityAndDifficulty();
  }

  /**
   * Derives physical capabilities from CarConfig
   */
  private applyCarStatistics(): void {
    this.massKg = this.carConfig.massKg || 1250;
    const stats = this.carConfig.stats;

    // Forward Speed: aligned with CarController (360 + (topSpeed / 100) * 355)
    this.maxForwardSpeed = 360 + (stats.topSpeed / 100) * 355;
    this.accelerationRate = 260 + (stats.acceleration / 100) * 520;
    const massFactor = Math.pow(1250 / this.massKg, 0.70);
    this.brakingRate = 840 * massFactor;
    this.turnRate = 2.1 + (stats.handling / 100) * 1.5;
    this.nitroMultiplier = 1.22 + (stats.nitro / 100) * 0.16;
  }

  /**
   * Tunes AI behaviors based on personality and difficulty setting
   */
  private applyPersonalityAndDifficulty(): void {
    // 1. Difficulty Scaling - Represents driving skill, apex precision, and strategic execution
    if (this.difficulty === 'EASY') {
      this.speedMultiplier = 0.82;
      this.steerResponsiveness = 0.82;
      this.lookaheadPoints = 8;
      this.nitroAggression = 0.20;
      this.overtakeTendency = 0.30;
      this.brakingRate *= 0.85;
    } else if (this.difficulty === 'MEDIUM') {
      this.speedMultiplier = 0.92;
      this.steerResponsiveness = 0.96;
      this.lookaheadPoints = 11;
      this.nitroAggression = 0.55;
      this.overtakeTendency = 0.65;
      this.brakingRate *= 0.98;
    } else {
      // HARD: Expert driving precision, crisp steering, controlled braking, full authentic car power
      this.speedMultiplier = 1.00;
      this.steerResponsiveness = 1.10;
      this.lookaheadPoints = 12;
      this.nitroAggression = 0.85;
      this.overtakeTendency = 0.85;
      this.brakingRate *= 1.05;
    }

    // 2. Personality-Specific Adjustments
    switch (this.personality) {
      case 'speed_demon': // VIPER R
        this.maxForwardSpeed *= 1.03;
        this.nitroAggression = Math.min(1.0, this.nitroAggression * 1.25);
        this.overtakeTendency *= 1.1;
        break;

      case 'aggressive': // RALLY APEX
        this.accelerationRate *= 1.12;
        this.turnRate *= 1.12;
        this.overtakeTendency = Math.min(1.0, this.overtakeTendency * 1.30);
        this.brakingRate *= 1.08;
        break;

      case 'defensive': // TITAN V8
        this.accelerationRate *= 0.96;
        this.dragCoefficient = 0.982;
        this.overtakeTendency *= 0.75;
        this.brakingRate *= 0.95;
        break;
    }
  }

  /**
   * Sets up exhaust flames and tire smoke particles
   */
  private setupParticles(scene: Phaser.Scene): void {
    const flameTexture = this.carConfig.id === 'viper-r'
      ? 'particle_green'
      : this.carConfig.id === 'rally-apex' ? 'particle_blue' : 'particle_orange';

    this.exhaustEmitterLeft = scene.add.particles(0, 0, flameTexture, {
      speed: { min: 60, max: 180 },
      scale: { start: 0.32, end: 0.04 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 180,
      frequency: 30,
      emitting: false,
      blendMode: 'ADD',
    }).setDepth(8);

    this.exhaustEmitterRight = scene.add.particles(0, 0, flameTexture, {
      speed: { min: 60, max: 180 },
      scale: { start: 0.32, end: 0.04 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 180,
      frequency: 30,
      emitting: false,
      blendMode: 'ADD',
    }).setDepth(8);

    this.tireSmokeEmitter = scene.add.particles(0, 0, 'particle_ember', {
      speed: { min: 20, max: 60 },
      scale: { start: 0.4, end: 0.8 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 250,
      frequency: 40,
      emitting: false,
      blendMode: 'NORMAL',
    }).setDepth(5);
  }

  /**
   * Main per-frame AI autonomous vehicle update loop
   */
  public update(
    dt: number,
    track: CircuitTrack,
    otherVehicles: VehicleCollisionData[],
    isControlsLocked: boolean = false
  ): void {
    if (isControlsLocked) {
      // Natural rolling stop during countdown
      this.vx *= Math.pow(0.85, dt * 60);
      this.vy *= Math.pow(0.85, dt * 60);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.forwardSpeed = 0;
      this.currentSpeedKMH = 0;
      this.syncSprite();
      return;
    }

    // 1. Locate closest waypoint on track circuit
    this.updateWaypointTracking(track);

    // 2. Track Curvature: immediate corner entry + upcoming braking anticipation horizon
    const immediateCurvature = this.calculateImmediateCurvature(track);
    const upcomingCurvature = this.calculateUpcomingCurvature(track);

    // 3. Calculate racing line target with curvature-adaptive lookahead & lane offset
    const targetPoint = this.calculateTargetWaypoint(track, immediateCurvature);

    // 4. Collision avoidance & overtaking sensor
    const avoidanceOffset = this.calculateAvoidanceVector(otherVehicles, track);

    let finalTargetX = targetPoint.x + avoidanceOffset.x;
    let finalTargetY = targetPoint.y + avoidanceOffset.y;

    // Ensure final steering target strictly remains within safe track road boundaries
    const maxSafeCorridor = Math.max(18, (track.roadWidth / 2) - 28);
    const pts = track.spacedPoints;
    const len = pts.length;
    const centerPt = pts[(this.currentWaypointIndex + this.lookaheadPoints) % len];
    const nextPt = pts[(this.currentWaypointIndex + this.lookaheadPoints + 1) % len];
    const tAngle = Math.atan2(nextPt.y - centerPt.y, nextPt.x - centerPt.x);
    const normX = -Math.sin(tAngle);
    const normY = Math.cos(tAngle);

    const lateralDist = (finalTargetX - centerPt.x) * normX + (finalTargetY - centerPt.y) * normY;
    const clampedLateral = Phaser.Math.Clamp(lateralDist, -maxSafeCorridor, maxSafeCorridor);
    finalTargetX = centerPt.x + normX * clampedLateral;
    finalTargetY = centerPt.y + normY * clampedLateral;

    // 5. Active Off-Road Recovery System
    const isOnTrack = track.isPointOnTrack(this.x, this.y);
    if (!isOnTrack) {
      // Direct vehicle towards a safe re-entry waypoint on the road centerline ahead
      const pts = track.spacedPoints;
      const reEntryIdx = (this.currentWaypointIndex + 3) % pts.length;
      const reEntryPt = pts[reEntryIdx];

      // Blend steering target strongly towards the road centerline (70% recovery blend)
      finalTargetX = Phaser.Math.Linear(finalTargetX, reEntryPt.x, 0.70);
      finalTargetY = Phaser.Math.Linear(finalTargetY, reEntryPt.y, 0.70);
    }

    // 6. Steer calculation towards target (Pure pursuit)
    const steerAngle = Math.atan2(finalTargetY - this.y, finalTargetX - this.x);
    let deltaAngle = Phaser.Math.Angle.Wrap(steerAngle - this.rotation);

    // 7. Curvature-Aware Speed regulation & Corner Braking Planning
    const cornerTargetSpeed = this.calculateCornerTargetSpeed(immediateCurvature, upcomingCurvature, track);

    // 8. Compute virtual vehicle controls (throttle, brake, steer, nitro)
    let throttle = 0;
    let brake = 0;
    let nitro = false;

    // Throttle / Brake control
    const currentMaxSpeed = this.maxForwardSpeed * this.speedMultiplier;
    let targetSpeed = Math.min(currentMaxSpeed, cornerTargetSpeed);

    if (!isOnTrack) {
      // In off-road recovery, cap target speed to track off-road ceiling to maintain control
      targetSpeed = Math.min(targetSpeed, this.maxForwardSpeed * track.physics.offRoadPenalty);
    }

    const speedDiff = this.forwardSpeed - targetSpeed;

    if (speedDiff < -14) {
      throttle = 1.0;
      brake = 0;
    } else if (speedDiff > 18) {
      // Progressive braking before and during corners (no oscillation)
      brake = Phaser.Math.Clamp(speedDiff / 70, 0.25, 1.0);
      throttle = 0;
    } else {
      // Maintenance cruise throttle
      throttle = 0.45;
      brake = 0;
    }

    // Off-road wheelspin mitigation: ease throttle if steering hard
    if (!isOnTrack && Math.abs(deltaAngle) > 0.35) {
      throttle = Math.min(throttle, 0.35);
    }

    // Personality nitro strategy (only when on-track, on straights, and not approaching a corner!)
    if (this.nitroCooldown > 0) {
      this.nitroCooldown -= dt;
    }

    const isStraightAhead = Math.abs(deltaAngle) < 0.20 && immediateCurvature < 0.22 && upcomingCurvature < 0.25;
    if (isOnTrack && this.nitroAmount > 25 && this.nitroCooldown <= 0) {
      if (this.personality === 'speed_demon') {
        // Fires nitro on long straight sections at high speed
        if (isStraightAhead && this.forwardSpeed > currentMaxSpeed * 0.72) {
          nitro = Math.random() < this.nitroAggression;
        }
      } else if (this.personality === 'aggressive') {
        // Fires nitro on corner exit acceleration onto straight
        if (throttle > 0.8 && this.forwardSpeed > 240 && immediateCurvature < 0.35 && upcomingCurvature < 0.28) {
          nitro = Math.random() < this.nitroAggression;
        }
      } else if (this.personality === 'defensive') {
        // Fires nitro on straightaways to hold position
        if (isStraightAhead && Math.random() < this.nitroAggression * 0.70) {
          nitro = true;
        }
      }
    }

    // 9. Apply Physical Driving Dynamics
    this.applyVehiclePhysics(dt, throttle, brake, deltaAngle, nitro, track);

    // 10. Visual Particle FX Update
    this.updateVisualFX();
  }

  /**
   * Tracks current position along circuit waypoints with robust search window and recovery
   */
  private updateWaypointTracking(track: CircuitTrack): void {
    const pts = track.spacedPoints;
    const len = pts.length;
    let closestIdx = this.currentWaypointIndex;
    let minDistSq = Infinity;

    // Search window around current waypoint (from 6 points back to 48 points forward)
    for (let offset = -6; offset < 48; offset++) {
      const idx = (this.currentWaypointIndex + offset + len) % len;
      const pt = pts[idx];
      const dx = this.x - pt.x;
      const dy = this.y - pt.y;
      const sq = dx * dx + dy * dy;
      if (sq < minDistSq) {
        minDistSq = sq;
        closestIdx = idx;
      }
    }

    // Fallback: If tracking was displaced (distance > 600px), scan entire circuit
    if (minDistSq > 360000) {
      for (let i = 0; i < len; i += 2) {
        const pt = pts[i];
        const dx = this.x - pt.x;
        const dy = this.y - pt.y;
        const sq = dx * dx + dy * dy;
        if (sq < minDistSq) {
          minDistSq = sq;
          closestIdx = i;
        }
      }
    }

    this.currentWaypointIndex = closestIdx;
  }

  /**
   * Calculates target waypoint ahead with curvature-adaptive lookahead & safe personality racing line
   */
  private calculateTargetWaypoint(track: CircuitTrack, curvature: number): Phaser.Math.Vector2 {
    const pts = track.spacedPoints;
    const len = pts.length;

    // Curvature-adaptive lookahead: contracts on curves to hug road, expands on straights for stability
    const speedRatio = Phaser.Math.Clamp(this.forwardSpeed / Math.max(1, this.maxForwardSpeed), 0, 1.0);
    const lookaheadScale = Phaser.Math.Clamp(1.0 - curvature * 0.58, 0.42, 1.0);
    const rawLookahead = Math.round((this.lookaheadPoints + speedRatio * 6) * lookaheadScale);
    const lookahead = Phaser.Math.Clamp(rawLookahead, 6, 17);

    const targetIdx = (this.currentWaypointIndex + lookahead) % len;
    const basePoint = pts[targetIdx];

    // Calculate road normal vector at target waypoint
    const nextIdx = (targetIdx + 1) % len;
    const nextPt = pts[nextIdx];
    const tangentAngle = Math.atan2(nextPt.y - basePoint.y, nextPt.x - basePoint.x);
    const normalX = -Math.sin(tangentAngle);
    const normalY = Math.cos(tangentAngle);

    // Personality Lateral Racing Line Offset
    // Constrain offset on curves and narrow tracks so vehicles do not drift onto road shoulders
    const maxSafeRacingOffset = Math.max(12, (track.roadWidth / 2) - 36);
    const curveDampener = Phaser.Math.Clamp(1.0 - curvature * 0.50, 0.35, 1.0);
    switch (this.personality) {
      case 'speed_demon':
        // Smooth geometric racing line (slight alternating sweep)
        this.targetOffset = Math.sin(this.currentWaypointIndex * 0.08) * Math.min(26, maxSafeRacingOffset) * curveDampener;
        break;

      case 'aggressive':
        // Dives to inside line on corners, shifts actively to attempt overtakes
        this.targetOffset = Math.sin(this.currentWaypointIndex * 0.14) * Math.min(32, maxSafeRacingOffset) * curveDampener;
        break;

      case 'defensive':
        // Stays closer to centerline, holding a predictable, stable lane
        this.targetOffset = Math.sin(this.currentWaypointIndex * 0.04) * Math.min(12, maxSafeRacingOffset) * curveDampener;
        break;
    }

    // Smoothly interpolate lateral offset
    this.lateralOffset = Phaser.Math.Linear(this.lateralOffset, this.targetOffset, 0.08);

    return new Phaser.Math.Vector2(
      basePoint.x + normalX * this.lateralOffset,
      basePoint.y + normalY * this.lateralOffset
    );
  }

  /**
   * Measures curvature of immediate upcoming track section (next 6-14 waypoints)
   */
  private calculateImmediateCurvature(track: CircuitTrack): number {
    const pts = track.spacedPoints;
    const len = pts.length;

    const p0 = pts[this.currentWaypointIndex];
    const p1 = pts[(this.currentWaypointIndex + 6) % len];
    const p2 = pts[(this.currentWaypointIndex + 14) % len];

    const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const angle2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    return Math.abs(Phaser.Math.Angle.Wrap(angle2 - angle1));
  }

  /**
   * Measures curvature further ahead (braking anticipation zone, 8-22 waypoints ahead)
   * Accounts for vehicle mass: heavier vehicles check further ahead to start braking earlier
   */
  private calculateUpcomingCurvature(track: CircuitTrack): number {
    const pts = track.spacedPoints;
    const len = pts.length;

    const massAnticipation = Math.round(9 * Math.pow(this.massKg / 1250, 0.35));
    const offset = Math.min(18, massAnticipation);

    const p0 = pts[(this.currentWaypointIndex + offset) % len];
    const p1 = pts[(this.currentWaypointIndex + offset + 7) % len];
    const p2 = pts[(this.currentWaypointIndex + offset + 15) % len];

    const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const angle2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    return Math.abs(Phaser.Math.Angle.Wrap(angle2 - angle1));
  }

  /**
   * Computes safe cornering speed based on track curvature, surface grip, vehicle handling & mass
   */
  private calculateCornerTargetSpeed(
    immediateCurvature: number,
    upcomingCurvature: number,
    track: CircuitTrack
  ): number {
    const top = this.maxForwardSpeed * this.speedMultiplier;
    // Anticipate upcoming corner: difficulty-adjusted braking horizon eliminates premature deceleration on Hard
    const upcomingWeight = this.difficulty === 'HARD' ? 0.78 : (this.difficulty === 'MEDIUM' ? 0.85 : 0.90);
    const effectiveCurvature = Math.max(immediateCurvature, upcomingCurvature * upcomingWeight);

    // Grip capability: accounts for track surface grip (0.82-1.08) and car handling stat (72-88)
    const handlingFactor = 0.92 + (this.carConfig.stats.handling / 100) * 0.18; // 1.05 - 1.08
    const gripCapacity = track.physics.gripMultiplier * handlingFactor;
    // Difficulty apex factor reflects driver skill in carrying speed through corners safely
    const difficultyApexFactor = this.difficulty === 'HARD' ? 1.05 : (this.difficulty === 'EASY' ? 0.95 : 1.00);

    if (effectiveCurvature < 0.18) {
      // Straightaway -> Full top speed
      return top;
    } else if (effectiveCurvature < 0.45) {
      // Sweeping corner: target ~185-205 km/h (460-510 px/s)
      const baseSweepPx = 480 * gripCapacity;
      const personalityFactor = this.personality === 'speed_demon' ? 1.04 : (this.personality === 'aggressive' ? 1.02 : 0.96);
      return Math.min(top, baseSweepPx * personalityFactor * difficultyApexFactor);
    } else if (effectiveCurvature < 0.80) {
      // Technical S-bend: target ~145-165 km/h (360-410 px/s)
      const baseSBendPx = 380 * gripCapacity;
      const personalityFactor = this.personality === 'aggressive' ? 1.05 : (this.personality === 'speed_demon' ? 1.00 : 0.95);
      return Math.min(top, baseSBendPx * personalityFactor * difficultyApexFactor);
    } else {
      // Hairpin / Chicane: target ~105-125 km/h (260-310 px/s)
      const baseHairpinPx = 285 * gripCapacity;
      const personalityFactor = this.personality === 'aggressive' ? 1.04 : 0.98;
      return Math.min(top, baseHairpinPx * personalityFactor * difficultyApexFactor);
    }
  }

  /**
   * Collision avoidance sensory ray: steers away from cars directly ahead
   */
  private calculateAvoidanceVector(
    otherVehicles: VehicleCollisionData[],
    track: CircuitTrack
  ): Phaser.Math.Vector2 {
    const avoidance = new Phaser.Math.Vector2(0, 0);
    const sensorRange = 120; // Lookahead collision detection bubble
    const maxSafeAvoidance = Math.max(16, (track.roadWidth / 2) - 34);

    const fwdX = Math.cos(this.rotation);
    const fwdY = Math.sin(this.rotation);
    const rightX = -fwdY;
    const rightY = fwdX;

    for (const other of otherVehicles) {
      if (other.id === this.id) continue;

      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist < sensorRange && dist > 1) {
        // Check if car is in front
        const forwardDot = dx * fwdX + dy * fwdY;
        if (forwardDot > 0) {
          // Car is ahead of us
          const lateralDot = dx * rightX + dy * rightY;

          // Stronger avoidance when car is directly in our path
          if (Math.abs(lateralDot) < 55) {
            // Steer into open space (opposite of other vehicle's lateral position)
            const steerDir = lateralDot >= 0 ? -1 : 1;
            const rawPush = (1 - dist / sensorRange) * 45 * this.overtakeTendency;
            const pushStrength = Math.min(rawPush, maxSafeAvoidance);

            avoidance.x += rightX * (steerDir * pushStrength);
            avoidance.y += rightY * (steerDir * pushStrength);
          }
        }
      }
    }

    return avoidance;
  }

  /**
   * Integrates vehicle physics equations (Acceleration, drag, steering, drift)
   */
  private applyVehiclePhysics(
    dt: number,
    throttle: number,
    brake: number,
    deltaAngle: number,
    nitro: boolean,
    track: CircuitTrack
  ): void {
    // 1. Heading vectors
    const fwdX = Math.cos(this.rotation);
    const fwdY = Math.sin(this.rotation);
    const rightX = -fwdY;
    const rightY = fwdX;

    this.forwardSpeed = this.vx * fwdX + this.vy * fwdY;
    this.lateralSpeed = this.vx * rightX + this.vy * rightY;

    // 2. Nitro Handling
    if (nitro && this.nitroAmount > 5) {
      this.isNitroActive = true;
      this.nitroAmount = Math.max(0, this.nitroAmount - this.nitroConsumeRate * dt);
    } else {
      this.isNitroActive = false;
      this.nitroAmount = Math.min(this.maxNitro, this.nitroAmount + this.nitroRegenRate * dt);
    }

    // 3. Track Boundary Penalty & Surface Dynamics
    const physics = track.physics;
    const isOnTrack = track.isPointOnTrack(this.x, this.y);
    let currentMaxSpeed = this.isNitroActive
      ? this.maxForwardSpeed * this.speedMultiplier * this.nitroMultiplier
      : this.maxForwardSpeed * this.speedMultiplier;

    if (!isOnTrack) {
      currentMaxSpeed = Math.min(currentMaxSpeed, this.maxForwardSpeed * physics.offRoadPenalty);
    }

    const accel = this.isNitroActive
      ? this.accelerationRate * 1.55
      : (isOnTrack ? this.accelerationRate * physics.accelMultiplier : this.accelerationRate * 0.7);

    // 4. Throttle / Braking
    if (throttle > 0) {
      if (this.forwardSpeed < currentMaxSpeed) {
        this.forwardSpeed += accel * throttle * dt;
        if (this.forwardSpeed > currentMaxSpeed) this.forwardSpeed = currentMaxSpeed;
      } else if (!isOnTrack && this.forwardSpeed > currentMaxSpeed) {
        // Smoothly bleed down excessive speed when entering off-road rather than immediate stop
        this.forwardSpeed -= 260 * dt;
        if (this.forwardSpeed < currentMaxSpeed) {
          this.forwardSpeed = currentMaxSpeed;
        }
      }
    } else if (brake > 0) {
      const effectiveBraking = this.brakingRate * (isOnTrack ? physics.brakingMultiplier : 0.85);
      this.forwardSpeed -= effectiveBraking * brake * dt;
      if (this.forwardSpeed < 0) this.forwardSpeed = 0;
    } else {
      const coastDrag = isOnTrack ? this.dragCoefficient : physics.offRoadDrag;
      this.forwardSpeed *= Math.pow(coastDrag, dt * 60);
    }

    // 5. Steering
    const absSpeed = Math.abs(this.forwardSpeed);
    const steerSpeedFactor = Math.min(absSpeed / 120, 1.0);
    const clampedSteer = Phaser.Math.Clamp(deltaAngle * 2.8, -1.0, 1.0);

    const isDriftingNow = (this.personality === 'aggressive' || physics.driftEaseFactor > 1.25)
      && Math.abs(deltaAngle) > (0.42 / physics.driftEaseFactor)
      && absSpeed > 170;
    const turn = isDriftingNow ? this.turnRate * 1.3 * physics.driftEaseFactor : this.turnRate;

    this.rotation += clampedSteer * turn * steerSpeedFactor * this.steerResponsiveness * dt;

    // 6. Lateral Traction & Slip
    const lateralGrip = isDriftingNow
      ? Math.min(0.96, 0.92 + (1 - physics.gripMultiplier) * 0.1)
      : (isOnTrack
          ? Math.max(0.79, Math.min(0.92, 0.84 + (1 - physics.gripMultiplier) * 0.4))
          : physics.offRoadDrag);

    this.lateralSpeed *= Math.pow(lateralGrip, dt * 60);
    this.isDrifting = isDriftingNow;
    this.driftAngle = Math.atan2(this.lateralSpeed, this.forwardSpeed);

    // 7. Update World Velocity
    const newFwdX = Math.cos(this.rotation);
    const newFwdY = Math.sin(this.rotation);
    const newRightX = -newFwdY;
    const newRightY = newFwdX;

    this.vx = this.forwardSpeed * newFwdX + this.lateralSpeed * newRightX;
    this.vy = this.forwardSpeed * newFwdY + this.lateralSpeed * newRightY;

    // Apply friction (higher top speed allowed under nitro)
    const effectiveDrag = isOnTrack
      ? (this.isNitroActive ? Math.min(0.993, this.dragCoefficient + 0.004) : this.dragCoefficient)
      : physics.offRoadDrag;
    this.vx *= Math.pow(effectiveDrag, dt * 60);
    this.vy *= Math.pow(effectiveDrag, dt * 60);

    // 8. Update Position & Enforce World Boundaries with Velocity Rebound
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    let hitBoundary = false;

    if (this.x < WORLD_BORDER_MARGIN) {
      this.x = WORLD_BORDER_MARGIN;
      if (this.vx < 0) {
        this.vx = Math.abs(this.vx) * WORLD_BORDER_RESTITUTION;
        hitBoundary = true;
      }
    } else if (this.x > track.worldWidth - WORLD_BORDER_MARGIN) {
      this.x = track.worldWidth - WORLD_BORDER_MARGIN;
      if (this.vx > 0) {
        this.vx = -Math.abs(this.vx) * WORLD_BORDER_RESTITUTION;
        hitBoundary = true;
      }
    }

    if (this.y < WORLD_BORDER_MARGIN) {
      this.y = WORLD_BORDER_MARGIN;
      if (this.vy < 0) {
        this.vy = Math.abs(this.vy) * WORLD_BORDER_RESTITUTION;
        hitBoundary = true;
      }
    } else if (this.y > track.worldHeight - WORLD_BORDER_MARGIN) {
      this.y = track.worldHeight - WORLD_BORDER_MARGIN;
      if (this.vy > 0) {
        this.vy = -Math.abs(this.vy) * WORLD_BORDER_RESTITUTION;
        hitBoundary = true;
      }
    }

    if (hitBoundary) {
      const reboundSpeed = Math.hypot(this.vx, this.vy);
      if (reboundSpeed > 1) {
        this.rotation = Math.atan2(this.vy, this.vx);
        this.forwardSpeed = reboundSpeed;
        this.lateralSpeed = 0;
      }
    }

    // 9. Speed in KM/H
    const speedPx = Math.hypot(this.vx, this.vy);
    this.currentSpeedKMH = Math.round(speedPx * 0.40);

    this.syncSprite();
  }

  /**
   * Syncs Phaser Sprite to physics position and heading
   */
  public syncSprite(): void {
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setRotation(this.rotation);
  }

  /**
   * Updates tire smoke and nitro flames
   */
  private updateVisualFX(): void {
    if (this.isNitroActive && this.exhaustEmitterLeft && this.exhaustEmitterRight) {
      const exhaust = this.getExhaustWorldPositions();
      const flameAngle = this.rotation + Math.PI;
      const speed = 160;
      const vx = Math.cos(flameAngle) * speed;
      const vy = Math.sin(flameAngle) * speed;

      this.exhaustEmitterLeft.setPosition(exhaust.left.x, exhaust.left.y);
      this.exhaustEmitterLeft.setParticleSpeed(vx, vy);
      this.exhaustEmitterLeft.emitting = true;

      this.exhaustEmitterRight.setPosition(exhaust.right.x, exhaust.right.y);
      this.exhaustEmitterRight.setParticleSpeed(vx, vy);
      this.exhaustEmitterRight.emitting = true;
    } else {
      if (this.exhaustEmitterLeft) this.exhaustEmitterLeft.emitting = false;
      if (this.exhaustEmitterRight) this.exhaustEmitterRight.emitting = false;
    }

    if (this.isDrifting && this.tireSmokeEmitter) {
      const rear = this.getRearTireWorldPositions();
      this.tireSmokeEmitter.emitParticleAt(rear.left.x, rear.left.y);
      this.tireSmokeEmitter.emitParticleAt(rear.right.x, rear.right.y);
    }
  }

  public getRearTireWorldPositions(): { left: { x: number; y: number }; right: { x: number; y: number } } {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rearDist = -28;
    const halfTrack = 16;

    return {
      left: {
        x: this.x + cos * rearDist - sin * -halfTrack,
        y: this.y + sin * rearDist + cos * -halfTrack,
      },
      right: {
        x: this.x + cos * rearDist - sin * halfTrack,
        y: this.y + sin * rearDist + cos * halfTrack,
      },
    };
  }

  public getExhaustWorldPositions(): { left: { x: number; y: number }; right: { x: number; y: number } } {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rearDist = -34;
    const pipeOffset = 10;

    return {
      left: {
        x: this.x + cos * rearDist - sin * -pipeOffset,
        y: this.y + sin * rearDist + cos * -pipeOffset,
      },
      right: {
        x: this.x + cos * rearDist - sin * pipeOffset,
        y: this.y + sin * rearDist + cos * pipeOffset,
      },
    };
  }

  public destroy(): void {
    this.sprite.destroy();
    this.exhaustEmitterLeft?.destroy();
    this.exhaustEmitterRight?.destroy();
    this.tireSmokeEmitter?.destroy();
  }
}

