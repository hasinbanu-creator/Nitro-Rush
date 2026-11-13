/**
 * Nitro Rush — Multiplayer Race Scene
 *
 * Implements the real-time authoritative multiplayer racing environment:
 * - Staggered 8-slot starting grid matching MultiplayerGridConfig.
 * - Circuit track rendering with procedural environments and apex curbs.
 * - Local player client-side prediction, 20 Hz input streaming, and 3-tier server reconciliation.
 * - Remote competitor visual proxies (RemoteCarProxy) driven by snapshot interpolation.
 * - Authoritative HUD with 8-racer live standings, vector minimap, split timers, and finish transitions.
 */

import Phaser from 'phaser';
import { CARS, type CarConfig } from '../data/CarData';
import { TRACKS, type TrackConfig } from '../data/TrackData';
import { CarController, type CarInputState } from '../game/CarController';
import { CircuitTrack } from '../game/CircuitTrack';
import { SoundEffects } from '../utils/SoundEffects';
import { networkManager } from '../multiplayer/NetworkManager';
import {
  MessageType,
  type PlayerSlotInfo,
  type RaceStartedPayload,
  type RaceStatePayload,
  type RaceFinishedPayload,
  type RaceResultsPayload,
  type PlayerDisconnectedPayload,
  type PlayerReconnectedPayload,
  type ErrorPayload,
} from '../multiplayer/ProtocolTypes';
import { InputHistoryBuffer } from '../multiplayer/InputHistoryBuffer';
import { PredictionReconciler } from '../multiplayer/PredictionReconciler';
import { RemoteCarProxy } from '../multiplayer/RemoteCarProxy';
import { MultiplayerGrid, type MultiplayerGridSlot } from '../multiplayer/MultiplayerGrid';
import { MultiplayerHUDAdapter, type CompetitorHUDItem } from '../multiplayer/MultiplayerHUDAdapter';
import type { RaceResultData, CompetitorResult } from '../game/RaceManager';

export interface MultiplayerRaceLaunchData {
  roomId: string;
  trackId: string;
  slotId: string;
  localPlayerId: string;
  slots: PlayerSlotInfo[];
  countdownDuration?: number;
}

export class MultiplayerRaceScene extends Phaser.Scene {
  // Room & Configuration Context
  public roomId!: string;
  public trackId!: string;
  public localSlotId!: string;
  public localPlayerId!: string;
  public slots: PlayerSlotInfo[] = [];
  public selectedTrack!: TrackConfig;
  public selectedCar!: CarConfig;

  // Track & Entities
  public track!: CircuitTrack;
  public player!: CarController;
  public remoteCars: Map<string, RemoteCarProxy> = new Map();
  public gridSlots: MultiplayerGridSlot[] = [];

  // Netcode & Prediction
  public historyBuffer: InputHistoryBuffer = new InputHistoryBuffer(120);
  public reconciler: PredictionReconciler = new PredictionReconciler();
  public inputSeq: number = 0;

  // Fixed Timestep Accumulator & Server Timebase
  public static readonly FIXED_TIMESTEP_MS: number = 50;
  public static readonly FIXED_TIMESTEP_SEC: number = 0.050;
  public static readonly MAX_ACCUMULATOR_MS: number = 250; // Max 5 catch-up ticks
  private physicsAccumulatorMs: number = 0;
  private lastServerTimeMs: number = 0;
  private lastServerTimeReceiptMs: number = 0;
  private displayedRaceTimeMs: number = 0;

  // Race State
  public isCountdownActive: boolean = true;
  public isRaceFinished: boolean = false;
  private lastCheckpointIndex: number = -1;

  // Visuals & HUD
  private hud!: MultiplayerHUDAdapter;
  private countdownContainer!: Phaser.GameObjects.Container;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownTimerEvent?: Phaser.Time.TimerEvent;

  // Keyboard Controls
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private keyShift?: Phaser.Input.Keyboard.Key;

  // Event Listener Cleanup
  private unsubscribeHandlers: (() => void)[] = [];

  constructor() {
    super({ key: 'MultiplayerRaceScene' });
  }

  init(data: MultiplayerRaceLaunchData): void {
    this.roomId = data.roomId;
    this.trackId = data.trackId || 'coastal-rush';
    this.localSlotId = data.slotId || 'P1';
    this.localPlayerId = data.localPlayerId;
    this.slots = data.slots || [];

    this.selectedTrack = TRACKS.find((t) => t.id === this.trackId) || TRACKS[0];

    // Find local player's chosen car by verified slot ID or player ID
    const localPlayer = this.slots.find(
      (s) => (s.slot && s.slot.toUpperCase() === this.localSlotId.toUpperCase()) ||
             (this.localPlayerId && s.id === this.localPlayerId)
    );
    if (localPlayer) {
      // Reconcile localPlayerId to room's player ID (e.g., 'p1', 'p2')
      this.localPlayerId = localPlayer.id;
    } else if (this.localSlotId) {
      // Fallback: derive room player ID from slot string if slots array was not yet populated
      this.localPlayerId = this.localSlotId.toLowerCase();
    }

    const carId = localPlayer ? localPlayer.carId : 'bolt-gt';
    this.selectedCar = CARS.find((c) => c.id === carId) || CARS[0];

    // Reset netcode state
    this.historyBuffer.clear();
    this.reconciler.reset();
    this.inputSeq = 0;
    this.physicsAccumulatorMs = 0;
    this.lastServerTimeMs = 0;
    this.lastServerTimeReceiptMs = 0;
    this.displayedRaceTimeMs = 0;
    this.isCountdownActive = true;
    this.isRaceFinished = false;
    this.lastCheckpointIndex = -1;
    this.remoteCars.clear();
  }

  /**
   * Helper to determine whether a given slot or player represents the local player.
   * Compares against both the verified local slot ID and local player ID.
   */
  public isLocalPlayer(playerId?: string, slotId?: string): boolean {
    if (slotId && this.localSlotId && slotId.toUpperCase() === this.localSlotId.toUpperCase()) {
      return true;
    }
    if (playerId && this.localPlayerId && playerId === this.localPlayerId) {
      return true;
    }
    return false;
  }

  create(): void {
    const { width, height } = this.scale;

    // 1. Build and Render Track
    this.track = new CircuitTrack(this, this.selectedTrack);
    this.track.renderTrack();

    // 2. Build 8-Slot Staggered Starting Grid
    this.gridSlots = MultiplayerGrid.generateGrid(this.track.checkpoints[0]);

    // 3. Spawn Local Player at Assigned Starting Grid Slot
    const localSlotIdx = this.slotIndexFromSlotString(this.localSlotId);
    const localGrid = this.gridSlots[localSlotIdx] || this.gridSlots[0];

    this.player = new CarController(
      this,
      localGrid.x,
      localGrid.y,
      localGrid.angle,
      this.selectedCar,
      'MEDIUM'
    );

    // Mini-turbo audio reward
    this.player.onMiniTurboAwarded = () => {
      SoundEffects.playMiniTurbo();
    };

    // 4. Spawn Remote Competitor Proxies at their Grid Slots
    this.slots.forEach((slotInfo) => {
      if (!this.isLocalPlayer(slotInfo.id, slotInfo.slot)) {
        const idx = this.slotIndexFromSlotString(slotInfo.slot);
        const gridPos = this.gridSlots[idx] || this.gridSlots[0];

        const proxy = new RemoteCarProxy(
          this,
          slotInfo.id,
          slotInfo.slot,
          slotInfo.name,
          slotInfo.carId,
          gridPos.x,
          gridPos.y,
          gridPos.angle
        );
        this.remoteCars.set(slotInfo.id, proxy);
      }
    });

    // 5. Camera Follow Local Car
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, this.track.worldWidth, this.track.worldHeight);

    // 6. Instantiate Multiplayer HUD
    this.hud = new MultiplayerHUDAdapter(this, this.track);

    // Initial HUD standings from lobby slots
    this.refreshInitialStandings();

    // 7. Setup Input Listeners
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

      // ESC: Exit race modal
      this.input.keyboard.on('keydown-ESC', () => {
        this.handleExitRace();
      });
    }

    // 8. Setup Network Protocol Listeners
    this.setupNetworkSubscriptions();

    // 9. Pre-Race 3-2-1 Countdown Sequence
    this.createCountdownOverlay(width, height);

    // 10. Clean up listeners on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup();
    });
  }

  private refreshInitialStandings(): void {
    const initialItems: CompetitorHUDItem[] = this.slots.map((s, idx) => ({
      id: s.id,
      name: s.name,
      slot: s.slot,
      pos: idx + 1,
      lap: 1,
      status: 'RACING',
      carId: s.carId,
    }));
    this.hud.updateAuthoritativeStandings(this.localPlayerId, initialItems);
  }

  private createCountdownOverlay(width: number, height: number): void {
    this.countdownContainer = this.add.container(width / 2, height / 2).setDepth(210).setScrollFactor(0);

    const title = this.add.text(0, -90, 'NITRO RUSH // GRID LOCKED', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#00f0ff',
      letterSpacing: 3,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.countdownContainer.add(title);

    this.countdownText = this.add.text(0, 10, '3', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '120px',
      color: '#ef4444',
      stroke: '#080c18',
      strokeThickness: 12,
      fontStyle: 'italic',
    }).setOrigin(0.5);
    this.countdownContainer.add(this.countdownText);

    SoundEffects.playCountdownBeep(false);

    let count = 3;
    this.countdownTimerEvent = this.time.addEvent({
      delay: 1000,
      repeat: 2,
      callback: () => {
        count--;
        if (!this.countdownText) return;

        if (count === 2) {
          this.countdownText.setText('2').setColor('#f97316');
          SoundEffects.playCountdownBeep(false);
        } else if (count === 1) {
          this.countdownText.setText('1').setColor('#eab308');
          SoundEffects.playCountdownBeep(false);
        } else if (count === 0) {
          this.countdownText.setText('GO!').setColor('#10b981');
          SoundEffects.playCountdownBeep(true);
          this.cameras.main.flash(250, 16, 185, 129);
        }
      },
    });
  }

  private setupNetworkSubscriptions(): void {
    // 1. RACE_STARTED: Authoritative start from server
    const offRaceStarted = networkManager.on(MessageType.RACE_STARTED, (payload: RaceStartedPayload) => {
      this.handleRaceStarted(payload);
    });
    this.unsubscribeHandlers.push(offRaceStarted);

    // 2. RACE_STATE: Authoritative 20 Hz world snapshots
    const offRaceState = networkManager.on(MessageType.RACE_STATE, (payload: RaceStatePayload) => {
      this.handleRaceState(payload);
    });
    this.unsubscribeHandlers.push(offRaceState);

    // 3. RACE_FINISHED: Individual competitor finish
    const offRaceFinished = networkManager.on(MessageType.RACE_FINISHED, (payload: RaceFinishedPayload) => {
      this.handleRaceFinished(payload);
    });
    this.unsubscribeHandlers.push(offRaceFinished);

    // 4. RACE_RESULTS: Official race conclusion for all participants
    const offRaceResults = networkManager.on(MessageType.RACE_RESULTS, (payload: RaceResultsPayload) => {
      this.handleRaceResults(payload);
    });
    this.unsubscribeHandlers.push(offRaceResults);

    // 5. PLAYER_DISCONNECTED: Competitor disconnected mid-race
    const offDisconnected = networkManager.on(MessageType.PLAYER_DISCONNECTED, (payload: PlayerDisconnectedPayload) => {
      const proxy = this.remoteCars.get(payload.playerId);
      if (proxy) {
        proxy.setDisconnected(true, payload.graceTimeRemainingSec);
      }
    });
    this.unsubscribeHandlers.push(offDisconnected);

    // 6. PLAYER_RECONNECTED: Competitor re-joined
    const offReconnected = networkManager.on(MessageType.PLAYER_RECONNECTED, (payload: PlayerReconnectedPayload) => {
      const proxy = this.remoteCars.get(payload.playerId);
      if (proxy) {
        proxy.setDisconnected(false);
      }
    });
    this.unsubscribeHandlers.push(offReconnected);

    // 7. Protocol Errors
    const offError = networkManager.on(MessageType.ERROR, (payload: ErrorPayload) => {
      console.warn('[MultiplayerRaceScene] Server error:', payload.errorCode, payload.message);
    });
    this.unsubscribeHandlers.push(offError);
  }

  // ==========================================================================
  // Protocol Handlers
  // ==========================================================================

  private handleRaceStarted(_payload: RaceStartedPayload): void {
    this.isCountdownActive = false;
    this.physicsAccumulatorMs = 0;
    this.lastServerTimeMs = 0;
    this.lastServerTimeReceiptMs = performance.now();
    this.displayedRaceTimeMs = 0;
    this.hud.startRaceTimer(0);

    // Destroy countdown overlay if still visible
    if (this.countdownContainer) {
      this.tweens.add({
        targets: this.countdownContainer,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.countdownContainer.destroy();
        },
      });
    }
  }

  private handleRaceState(payload: RaceStatePayload): void {
    // 0. Update Server-Authoritative Race Timebase
    if (payload.serverTimeMs > this.lastServerTimeMs) {
      this.lastServerTimeMs = payload.serverTimeMs;
      this.lastServerTimeReceiptMs = performance.now();
    }

    // 1. Authoritative Server Reconciliation for Local Player
    const localTelemetry = payload.vehicles.find((v) => this.isLocalPlayer(v.id));
    const ackSeq = payload.ackInputSeq ? payload.ackInputSeq[this.localPlayerId] : undefined;

    if (localTelemetry && ackSeq !== undefined) {
      this.reconciler.reconcile(ackSeq, localTelemetry, this.player, this.historyBuffer, this.track);

      // Checkpoint cross notification
      if (localTelemetry.nextCp !== this.lastCheckpointIndex) {
        if (this.lastCheckpointIndex !== -1) {
          this.hud.showCheckpointFlash(localTelemetry.nextCp);
          SoundEffects.playCheckpoint();
        }
        this.lastCheckpointIndex = localTelemetry.nextCp;
      }
    }

    // 2. Feed Remote Vehicle Snapshot Interpolator
    const arrivalTimeMs = performance.now();
    for (const v of payload.vehicles) {
      if (!this.isLocalPlayer(v.id)) {
        const proxy = this.remoteCars.get(v.id);
        if (proxy) {
          proxy.pushSnapshot(v, payload.serverTimeMs, arrivalTimeMs);
        }
      }
    }

    // 3. Update Live Standings on HUD
    const hudItems: CompetitorHUDItem[] = payload.vehicles.map((v) => {
      const slotInfo = this.slots.find((s) => s.id === v.id);
      return {
        id: v.id,
        name: slotInfo ? slotInfo.name : v.id.slice(0, 8),
        slot: slotInfo ? slotInfo.slot : 'P?',
        pos: v.pos,
        lap: v.lap,
        status: v.status,
        carId: slotInfo ? slotInfo.carId : 'bolt-gt',
      };
    });
    this.hud.updateAuthoritativeStandings(this.localPlayerId, hudItems);
  }

  private handleRaceFinished(payload: RaceFinishedPayload): void {
    if (this.isLocalPlayer(payload.playerId)) {
      this.isRaceFinished = true;
      SoundEffects.playFinishRace();
      this.hud.showFinishBanner(payload.finishPosition, this.slots.length);
    } else {
      const proxy = this.remoteCars.get(payload.playerId);
      if (proxy) {
        proxy.setFinished(payload.finishPosition);
      }
    }
  }

  private handleRaceResults(payload: RaceResultsPayload): void {
    // Format official multiplayer results for ResultsScene
    const localItem = payload.results.find((r) => this.isLocalPlayer(r.playerId));
    const playerPosition = localItem ? localItem.position : 1;

    const competitors: CompetitorResult[] = payload.results.map((r) => ({
      id: r.playerId,
      name: r.displayName,
      carId: r.carId,
      carName: (CARS.find((c) => c.id === r.carId) || CARS[0]).name,
      isPlayer: this.isLocalPlayer(r.playerId),
      finishPosition: r.position,
      isFinished: r.status === 'FINISHED',
      totalTimeMs: r.totalTimeMs,
      bestLapMs: r.bestLapMs,
      lapTimesMs: [r.bestLapMs],
      status: r.status as 'FINISHED' | 'DNF',
    }));

    const resultData: RaceResultData = {
      trackId: this.trackId,
      trackName: this.selectedTrack.name,
      carId: this.selectedCar.id,
      carName: this.selectedCar.name,
      difficulty: 'MEDIUM',
      totalTimeMs: localItem ? localItem.totalTimeMs : 0,
      bestLapMs: localItem ? localItem.bestLapMs : 0,
      lapTimesMs: localItem ? [localItem.bestLapMs] : [],
      playerPosition,
      competitors,
    };

    this.time.delayedCall(2400, () => {
      this.cameras.main.fadeOut(350, 7, 10, 20);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.cleanup();
        this.scene.start('ResultsScene', resultData);
      });
    });
  }

  // ==========================================================================
  // Display Loop (60 FPS)
  // ==========================================================================

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    // 1. Gather local inputs
    let inputs: CarInputState;
    if (this.isRaceFinished) {
      inputs = { throttle: 0, brake: 0.35, steer: 0, drift: false, nitro: false };
    } else {
      inputs = {
        throttle: (this.cursors?.up.isDown || this.keyW?.isDown) ? 1 : 0,
        brake: (this.cursors?.down.isDown || this.keyS?.isDown) ? 1 : 0,
        steer: 0,
        drift: !!(this.cursors?.space.isDown || this.keySpace?.isDown),
        nitro: !!this.keyShift?.isDown,
      };

      if (this.cursors?.left.isDown || this.keyA?.isDown) inputs.steer -= 1;
      if (this.cursors?.right.isDown || this.keyD?.isDown) inputs.steer += 1;
    }

    // 2. Client-Side Prediction for Local Player with Fixed 50ms Accumulator
    if (!this.isCountdownActive) {
      // Bounded catch-up: clamp frame delta to prevent spiral of death during backgrounding / stalls
      const clampedDeltaMs = Math.min(delta, MultiplayerRaceScene.MAX_ACCUMULATOR_MS);
      this.physicsAccumulatorMs += clampedDeltaMs;

      // Ensure accumulator does not exceed MAX_ACCUMULATOR_MS (max 5 catch-up ticks)
      if (this.physicsAccumulatorMs > MultiplayerRaceScene.MAX_ACCUMULATOR_MS) {
        this.physicsAccumulatorMs = MultiplayerRaceScene.MAX_ACCUMULATOR_MS;
      }

      while (this.physicsAccumulatorMs >= MultiplayerRaceScene.FIXED_TIMESTEP_MS) {
        this.physicsAccumulatorMs -= MultiplayerRaceScene.FIXED_TIMESTEP_MS;
        this.inputSeq++;

        const isOnTrack = this.track.isPointOnTrack(this.player.x, this.player.y);
        this.player.update(
          MultiplayerRaceScene.FIXED_TIMESTEP_SEC,
          inputs,
          false,
          isOnTrack,
          this.track.worldWidth,
          this.track.worldHeight,
          this.track.physics
        );

        // Store prediction snapshot in history buffer (1:1 lockstep with fixed physics step)
        this.historyBuffer.push({
          sequenceNumber: this.inputSeq,
          timestamp: performance.now(),
          input: { ...inputs },
          stateSnapshot: {
            x: this.player.x,
            y: this.player.y,
            vx: this.player.vx,
            vy: this.player.vy,
            rotation: this.player.rotation,
            forwardSpeed: this.player.forwardSpeed,
            lateralSpeed: this.player.lateralSpeed,
            currentSpeedKMH: this.player.currentSpeedKMH,
            nitroAmount: this.player.nitroAmount,
            isDrifting: this.player.isDrifting,
            isReverseGear: this.player.isReverseGear,
          },
        });

        // Transmit 20 Hz PLAYER_INPUT frame to authoritative server
        networkManager.send(MessageType.PLAYER_INPUT, {
          roomId: this.roomId,
          sequenceNumber: this.inputSeq,
          throttle: inputs.throttle,
          brake: inputs.brake,
          steer: inputs.steer,
          drift: inputs.drift,
          nitro: inputs.nitro,
        });
      }

      // Smooth visual position and angular offsets from reconciler
      this.reconciler.updateVisualSmoothing(this.player);
    }

    // 3. Update Remote Competitor Proxies via Snapshot Interpolation
    const clientNow = performance.now();
    const latency = networkManager.getLatency();
    for (const proxy of this.remoteCars.values()) {
      proxy.updateRtt(latency.currentRttMs, latency.smoothedRttMs);
      proxy.update(clientNow, dt);
    }

    // 4. Update HUD with Server-Synchronized Monotonic Extrapolated Time
    if (!this.isCountdownActive) {
      if (this.lastServerTimeReceiptMs > 0) {
        const extrapolatedTime = this.lastServerTimeMs + (clientNow - this.lastServerTimeReceiptMs);
        if (extrapolatedTime > this.displayedRaceTimeMs) {
          this.displayedRaceTimeMs = extrapolatedTime;
        }
      } else {
        this.displayedRaceTimeMs += delta;
      }
    }

    this.hud.update(
      dt,
      this.player.currentSpeedKMH,
      this.player.nitroAmount,
      this.player.isReverseGear,
      this.displayedRaceTimeMs
    );

    const remotePositions = Array.from(this.remoteCars.values()).map((p) => ({
      id: p.playerId,
      x: p.x,
      y: p.y,
      color: p.carConfig.accentColor || 0xf59e0b,
    }));
    this.hud.updateMinimap(this.player.x, this.player.y, remotePositions);

    // 6. Update Environmental Scenery Animations
    this.track.update(dt);
  }

  private handleExitRace(): void {
    if (this.roomId) {
      networkManager.send(MessageType.CANCEL_MATCHMAKING, { roomId: this.roomId });
    }
    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.cleanup();
      this.scene.start('MainMenuScene');
    });
  }

  private slotIndexFromSlotString(slotStr: string): number {
    if (!slotStr) return 0;
    const num = parseInt(slotStr.replace(/\D/g, ''), 10);
    return isNaN(num) ? 0 : Math.max(0, Math.min(7, num - 1));
  }

  public cleanup(): void {
    this.reconciler.reset();
    this.countdownTimerEvent?.destroy();
    this.unsubscribeHandlers.forEach((unsub) => unsub());
    this.unsubscribeHandlers = [];

    for (const proxy of this.remoteCars.values()) {
      proxy.destroy();
    }
    this.remoteCars.clear();

    this.hud?.destroy();
  }
}
