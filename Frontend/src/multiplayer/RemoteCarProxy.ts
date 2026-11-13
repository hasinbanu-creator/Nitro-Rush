/**
 * Nitro Rush — Remote Vehicle Proxy
 *
 * Visual proxy representing a remote competitor in MultiplayerRaceScene.
 * Driven strictly by authoritative server telemetry snapshots via SnapshotInterpolator.
 * Manages visual rendering (sprite, shadow, nameplate, headlights), particle effects
 * (exhaust flames, tire smoke), and disconnect/finish states.
 */

import type Phaser from 'phaser';
import { CARS, type CarConfig } from '../data/CarData.ts';
import { SnapshotInterpolator, type InterpolatedVehicleState } from './SnapshotInterpolator.ts';
import type { VehicleTelemetry } from './ProtocolTypes.ts';

export class RemoteCarProxy {
  public scene: Phaser.Scene;
  public playerId: string;
  public slotId: string;
  public displayName: string;
  public carConfig: CarConfig;

  // Transform & Physics State
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public rotation: number;
  public speedKMH: number = 0;
  public lap: number = 1;
  public nextCp: number = 0;
  public nitro: number = 100;
  public isDrifting: boolean = false;
  public pos: number = 1;
  public status: string = 'RACING';
  public isDisconnected: boolean = false;

  // Visual Game Objects
  public sprite: Phaser.GameObjects.Sprite;
  public shadow: Phaser.GameObjects.Ellipse;
  public nameplateContainer: Phaser.GameObjects.Container;
  private nameText: Phaser.GameObjects.Text;
  private disconnectText: Phaser.GameObjects.Text;

  // FX Emitters
  private tireSmokeEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private exhaustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Snapshot Interpolator
  public interpolator: SnapshotInterpolator;

  constructor(
    scene: Phaser.Scene,
    playerId: string,
    slotId: string,
    displayName: string,
    carId: string,
    initialX: number,
    initialY: number,
    initialAngle: number
  ) {
    this.scene = scene;
    this.playerId = playerId;
    this.slotId = slotId;
    this.displayName = displayName;
    this.x = initialX;
    this.y = initialY;
    this.rotation = initialAngle;

    this.carConfig = CARS.find((c) => c.id === carId) || CARS[0];
    this.interpolator = new SnapshotInterpolator();

    // 1. Vehicle Ground Shadow (depth: 8)
    this.shadow = scene.add.ellipse(initialX, initialY, 90, 140, 0x000000, 0.55);
    this.shadow.setScale(0.58).setDepth(8);

    // 2. Vehicle Sprite (depth: 10)
    this.sprite = scene.add.sprite(initialX, initialY, this.carConfig.textureKey);
    this.sprite.setScale(0.58).setDepth(10);

    // 3. Driver Nameplate & Slot Tag (depth: 25, upright facing)
    this.nameplateContainer = scene.add.container(initialX, initialY - 42).setDepth(25);

    const plateW = 120;
    const plateH = 20;
    const plateBg = scene.add.graphics();
    plateBg.fillStyle(0x0a1020, 0.85);
    plateBg.fillRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, 4);
    plateBg.lineStyle(1, this.carConfig.accentColor || 0x00f0ff, 0.7);
    plateBg.strokeRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, 4);
    this.nameplateContainer.add(plateBg);

    const labelStr = `[${slotId}] ${displayName}`;
    this.nameText = scene.add.text(0, 0, labelStr, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.nameplateContainer.add(this.nameText);

    // 4. Disconnect Warning Banner (initially hidden)
    this.disconnectText = scene.add.text(0, -18, '⚠ DISCONNECTED (15s)', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ef4444',
      fontStyle: 'bold',
    }).setOrigin(0.5).setVisible(false);
    this.nameplateContainer.add(this.disconnectText);

    // 5. FX Particle Emitters
    this.setupParticles();

    // 6. Synchronize initial visual transforms after all objects are safely instantiated
    this.syncVisualTransforms();
  }

  private setupParticles(): void {
    if (!this.scene.textures.exists('smoke_particle')) return;

    this.tireSmokeEmitter = this.scene.add.particles(this.x, this.y, 'smoke_particle', {
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 300,
      frequency: -1, // manual emit on drift
    }).setDepth(6);

    const flameTexture = this.scene.textures.exists('particle_orange') ? 'particle_orange' : 'smoke_particle';
    this.exhaustEmitter = this.scene.add.particles(this.x, this.y, flameTexture, {
      speed: { min: 40, max: 100 },
      scale: { start: 0.3, end: 0.05 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 200,
      frequency: -1,
      blendMode: 'ADD',
    }).setDepth(9);
  }

  /**
   * Pushes authoritative telemetry from a RACE_STATE broadcast.
   */
  public pushSnapshot(telemetry: VehicleTelemetry, serverTimeMs: number, arrivalTimeMs?: number): void {
    this.interpolator.pushSnapshot(telemetry, serverTimeMs, arrivalTimeMs);

    // Update status and disconnect state from authoritative telemetry
    this.status = telemetry.status;
    this.lap = telemetry.lap;
    this.nextCp = telemetry.nextCp;
    this.pos = telemetry.pos;

    if (telemetry.status === 'DISCONNECTED') {
      this.setDisconnected(true);
    } else if (this.isDisconnected && telemetry.status === 'RACING') {
      this.setDisconnected(false);
    }
  }

  /**
   * Updates proxy position, rotation, and visual effects based on the interpolation sample.
   */
  public updateRtt(rttMs: number, smoothedRttMs?: number): void {
    this.interpolator.updateRtt(rttMs, smoothedRttMs);
  }

  public update(renderTimeMs: number, _dt: number): void {
    const sample: InterpolatedVehicleState | null = this.interpolator.sample(renderTimeMs);
    if (!sample) return;

    this.x = sample.x;
    this.y = sample.y;
    this.vx = sample.vx;
    this.vy = sample.vy;
    this.rotation = sample.rotation;
    this.speedKMH = sample.speedKMH;
    this.nitro = sample.nitro;
    this.isDrifting = sample.isDrifting;

    this.syncVisualTransforms();

    // Trigger visual particles
    if (this.isDrifting && this.tireSmokeEmitter && this.speedKMH > 40) {
      this.tireSmokeEmitter.emitParticleAt(this.x, this.y, 2);
    }

    if (this.nitro > 0 && this.speedKMH > 100 && this.exhaustEmitter) {
      const rearDist = 24;
      const exX = this.x - Math.cos(this.rotation) * rearDist;
      const exY = this.y - Math.sin(this.rotation) * rearDist;
      this.exhaustEmitter.emitParticleAt(exX, exY, 1);
    }
  }

  /**
   * Synchronizes visual Phaser game objects with physics coordinates.
   */
  private syncVisualTransforms(): void {
    if (this.sprite) {
      this.sprite.x = this.x;
      this.sprite.y = this.y;
      this.sprite.rotation = this.rotation + Math.PI / 2;
    }

    if (this.shadow) {
      this.shadow.x = this.x;
      this.shadow.y = this.y;
      this.shadow.rotation = this.rotation + Math.PI / 2;
    }

    // Nameplate remains non-rotated above vehicle
    if (this.nameplateContainer) {
      this.nameplateContainer.x = this.x;
      this.nameplateContainer.y = this.y - 42;
    }
  }

  /**
   * Handles remote player disconnect status.
   */
  public setDisconnected(isDisconnected: boolean, graceSec: number = 15): void {
    this.isDisconnected = isDisconnected;
    if (isDisconnected) {
      this.sprite?.setAlpha(0.45);
      this.disconnectText?.setText(`⚠ DISCONNECTED (${graceSec}s)`).setVisible(true);
    } else {
      this.sprite?.setAlpha(1.0);
      this.disconnectText?.setVisible(false);
    }
  }

  /**
   * Handles remote player race finish status.
   */
  public setFinished(position: number): void {
    this.status = 'FINISHED';
    this.disconnectText?.setText(`🏁 FINISHED #${position}`).setColor('#10b981').setVisible(true);
  }

  /**
   * Clean destruction of all visual objects and emitters.
   */
  public destroy(): void {
    this.tireSmokeEmitter?.destroy();
    this.exhaustEmitter?.destroy();
    this.nameplateContainer?.destroy();
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.interpolator.clear();
  }
}

