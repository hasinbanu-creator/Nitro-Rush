import Phaser from 'phaser';
import { CARS, type CarConfig } from '../data/CarData';
import { TRACKS, type TrackConfig } from '../data/TrackData';
import { DIFFICULTIES, type DifficultyConfig, type DifficultyId, selectionState } from '../state/SelectionState';
import { CarController, type CarInputState, type TirePosition } from '../game/CarController';
import { AIController, type AIPersonality, type VehicleCollisionData } from '../game/AIController';
import { CircuitTrack } from '../game/CircuitTrack';
import { RaceManager, formatLapTime, type RaceResultData } from '../game/RaceManager';
import { SoundEffects } from '../utils/SoundEffects';
import { UIHelpers, CYBER_THEME } from '../utils/UIHelpers';
import { settingsManager } from '../utils/SettingsManager';

export class RaceScene extends Phaser.Scene {
  // Configuration
  public selectedTrack!: TrackConfig;
  public selectedCar!: CarConfig;
  public selectedDifficulty!: DifficultyConfig;

  // Game Entities & World
  public track!: CircuitTrack;
  public player!: CarController;
  public aiOpponents: AIController[] = [];
  public raceManager!: RaceManager;

  // Track player state
  public isRaceFinished: boolean = false;
  private lastBumpSoundTime: number = 0;

  // Inputs
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private keyShift?: Phaser.Input.Keyboard.Key;

  // Visual FX
  private skidGraphics!: Phaser.GameObjects.Graphics;
  private prevLeftTire: TirePosition | null = null;
  private prevRightTire: TirePosition | null = null;
  private exhaustEmitterLeft?: Phaser.GameObjects.Particles.ParticleEmitter;
  private exhaustEmitterRight?: Phaser.GameObjects.Particles.ParticleEmitter;
  private tireSmokeEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private speedFeedbackGraphics!: Phaser.GameObjects.Graphics;

  // Skid Mark Fading Buffer
  private skidSegments: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    alpha: number;
    birthTime: number;
  }[] = [];
  public static readonly SKID_LIFETIME = 14.0;

  // Race Lifecycle & Countdown
  public isCountdownActive: boolean = true;
  private countdownValue: number = 3;
  private countdownText!: Phaser.GameObjects.Text;
  private isPaused: boolean = false;
  private pauseContainer: Phaser.GameObjects.Container | null = null;

  // HUD Elements
  private hudContainer!: Phaser.GameObjects.Container;
  private speedNumberText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private speedArcGraphics!: Phaser.GameObjects.Graphics;
  private nitroFillGraphics!: Phaser.GameObjects.Graphics;
  private nitroPercentText!: Phaser.GameObjects.Text;
  private driftStatusText!: Phaser.GameObjects.Text;

  // Lap & Telemetry HUD Elements
  public lapCounterText!: Phaser.GameObjects.Text;
  public currentLapTimerText!: Phaser.GameObjects.Text;
  public bestLapTimerText!: Phaser.GameObjects.Text;
  public totalRaceTimerText!: Phaser.GameObjects.Text;
  public progressPercentText!: Phaser.GameObjects.Text;
  private progressBarGraphics!: Phaser.GameObjects.Graphics;
  public wrongWayBanner!: Phaser.GameObjects.Container;
  public announcementText!: Phaser.GameObjects.Text;
  private lapNoticeContainer!: Phaser.GameObjects.Container;

  // Live Leaderboard HUD Elements
  public leaderboardContainer!: Phaser.GameObjects.Container;
  public playerPosBadgeText!: Phaser.GameObjects.Text;
  public leaderboardRows: {
    bg: Phaser.GameObjects.Graphics;
    posText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
    lapText: Phaser.GameObjects.Text;
  }[] = [];

  // Vector Minimap HUD Elements
  public minimapContainer!: Phaser.GameObjects.Container;
  private minimapTrackGraphics!: Phaser.GameObjects.Graphics;
  private minimapPipsGraphics!: Phaser.GameObjects.Graphics;
  private minimapScale: number = 1;
  private minimapOffsetX: number = 0;
  private minimapOffsetY: number = 0;

  // Reverse Camera Follow
  private cameraLeadX: number = 0;
  private cameraLeadY: number = 0;

  // AI Opponent Direction Chevrons
  private chevronGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'RaceScene' });
  }

  init(data?: { trackId?: string; carId?: string; difficulty?: DifficultyId }): void {
    if (data?.trackId) selectionState.setTrack(data.trackId);
    if (data?.carId) selectionState.setCar(data.carId);
    if (data?.difficulty) selectionState.setDifficulty(data.difficulty);
  }

  create(): void {
    const { width, height } = this.scale;
    this.isRaceFinished = false;

    // 1. Read selections from SelectionState
    const state = selectionState.getState();
    this.selectedTrack = TRACKS.find((t) => t.id === state.selectedTrackId) || TRACKS[0];
    this.selectedCar = CARS.find((c) => c.id === state.selectedCarId) || CARS[0];
    this.selectedDifficulty = DIFFICULTIES[state.selectedDifficulty] || DIFFICULTIES['MEDIUM'];

    // 2. Build Selected Circuit Track
    this.track = new CircuitTrack(this, this.selectedTrack);
    this.track.renderTrack();

    // 3. Persistent Skid Marks Layer (Above road, below vehicles)
    this.skidGraphics = this.add.graphics().setDepth(5);

    // 4. Instantiate Player Vehicle on Grid Slot P1
    const p1Slot = this.track.startGridPositions[0] || this.track.startPosition;
    this.player = new CarController(
      this,
      p1Slot.x,
      p1Slot.y,
      p1Slot.angle,
      this.selectedCar,
      this.selectedDifficulty.id
    );

    // Hook up drift-to-nitro Mini-Turbo reward callback
    this.player.onMiniTurboAwarded = (boostAmount: number) => {
      SoundEffects.playMiniTurbo();
      this.showMiniTurboNotice(boostAmount);
    };

    // 5. Instantiate 3 AI Opponents on Grid Slots P2, P3, P4
    this.setupAIOpponents();

    // 6. Initialize RaceManager with All 4 Competitors
    this.setupRaceManager();

    // 7. Setup Visual FX Particle Emitters for Player
    this.setupVehicleParticles();

    // 8. Camera Follow with Dynamic Zoom
    this.cameras.main.setBounds(0, 0, this.track.worldWidth, this.track.worldHeight);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.0);

    // 9. Input Controls Setup
    this.setupInputControls();

    // 10. Build Race HUD (Fixed to Screen Viewport)
    this.createRaceHUD(width, height);

    // 10b. Build Vector Minimap HUD
    this.createMinimap(width);

    // 10c. AI Opponent Direction Chevrons Layer
    this.chevronGraphics = this.add.graphics().setDepth(96).setScrollFactor(0);

    // 11. Announcements & Alerts (Wrong way, Final Lap, Finish)
    this.createAnnouncementOverlays(width, height);

    // 12. Synchronized Countdown Sequence (3 -> 2 -> 1 -> GO!)
    this.startCountdownSequence(width, height);

    // 13. Speed Feedback Layer (Screen-edge warp streaks)
    this.speedFeedbackGraphics = this.add.graphics().setDepth(90).setScrollFactor(0);

    // Clean up entities when scene shuts down
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanUpEntities();
    });

    // Fade camera in from black
    this.cameras.main.fadeIn(400, 7, 10, 20);
  }

  /**
   * Sets up 3 AI opponents on starting grid slots P2, P3, P4
   */
  private setupAIOpponents(): void {
    this.aiOpponents = [];

    // The 3 AI archetypes
    const aiDefinitions: {
      id: string;
      name: string;
      preferredCarId: string;
      fallbackCarId: string;
      personality: AIPersonality;
      slotIndex: number;
    }[] = [
      {
        id: 'ai_viper',
        name: 'VIPER R',
        preferredCarId: 'viper-r',
        fallbackCarId: 'bolt-gt',
        personality: 'speed_demon',
        slotIndex: 1, // P2: (800, 1945)
      },
      {
        id: 'ai_rally',
        name: 'RALLY APEX',
        preferredCarId: 'rally-apex',
        fallbackCarId: 'bolt-gt',
        personality: 'aggressive',
        slotIndex: 2, // P3: (740, 1890)
      },
      {
        id: 'ai_titan',
        name: 'TITAN V8',
        preferredCarId: 'titan-v8',
        fallbackCarId: 'bolt-gt',
        personality: 'defensive',
        slotIndex: 3, // P4: (680, 1945)
      },
    ];

    aiDefinitions.forEach((def) => {
      // Pick unique car (fallback if player chose the same car)
      const carId = this.selectedCar.id === def.preferredCarId ? def.fallbackCarId : def.preferredCarId;
      const carConfig = CARS.find((c) => c.id === carId) || CARS[1];
      const slot = this.track.startGridPositions[def.slotIndex] || this.track.startPosition;

      const ai = new AIController(
        this,
        def.id,
        def.name,
        slot.x,
        slot.y,
        slot.angle,
        carConfig,
        def.personality,
        this.selectedDifficulty.id
      );

      this.aiOpponents.push(ai);
    });
  }

  /**
   * Initializes RaceManager with all 4 competitors (Player + 3 AI)
   */
  private setupRaceManager(): void {
    const competitors = [
      {
        id: 'player',
        name: 'YOU',
        carId: this.selectedCar.id,
        carName: this.selectedCar.name,
        isPlayer: true,
      },
      ...this.aiOpponents.map((ai) => ({
        id: ai.id,
        name: ai.name,
        carId: ai.carConfig.id,
        carName: ai.carConfig.name,
        isPlayer: false,
      })),
    ];

    this.raceManager = new RaceManager({
      checkpoints: this.track.checkpoints,
      trackId: this.selectedTrack.id,
      trackName: this.selectedTrack.name,
      carId: this.selectedCar.id,
      carName: this.selectedCar.name,
      difficulty: this.selectedDifficulty.id,
      competitors,
    });

    // Checkpoint cleared callback (player)
    this.raceManager.onCheckpointCleared = (cpIndex, _totalCheckpoints) => {
      SoundEffects.playCheckpoint();
      this.flashCheckpointNotice(cpIndex);
    };

    // Lap completed callback (player)
    this.raceManager.onLapCompleted = (lapNumber, lapTimeMs, isBest) => {
      SoundEffects.playLapComplete(isBest);
      this.showLapCompleteNotice(lapNumber, lapTimeMs, isBest);
    };

    // Final lap callback (player)
    this.raceManager.onFinalLap = () => {
      SoundEffects.playFinalLap();
      this.triggerFinalLapAnnouncement();
    };

    // Race finished callback
    this.raceManager.onRaceFinished = (results) => {
      this.handleRaceFinished(results);
    };
  }

  /**
   * Initializes keyboard inputs for vehicle controls
   */
  private setupInputControls(): void {
    if (!this.input.keyboard) return;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // ESC toggles pause menu
    this.input.keyboard.on('keydown-ESC', () => {
      if (!this.isRaceFinished) {
        this.togglePause();
      }
    });
  }

  /**
   * Sets up procedural particle emitters for exhaust flames and tire smoke
   */
  private setupVehicleParticles(): void {
    const flameTexture = this.selectedCar.id === 'viper-r'
      ? 'particle_green'
      : this.selectedCar.id === 'rally-apex' ? 'particle_blue' : 'particle_orange';

    this.exhaustEmitterLeft = this.add.particles(0, 0, flameTexture, {
      speed: { min: 80, max: 220 },
      scale: { start: 0.38, end: 0.04 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 220,
      frequency: 25,
      emitting: false,
      blendMode: 'ADD',
    }).setDepth(9);

    this.exhaustEmitterRight = this.add.particles(0, 0, flameTexture, {
      speed: { min: 80, max: 220 },
      scale: { start: 0.38, end: 0.04 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 220,
      frequency: 25,
      emitting: false,
      blendMode: 'ADD',
    }).setDepth(9);

    this.tireSmokeEmitter = this.add.particles(0, 0, 'particle_ember', {
      speed: { min: 30, max: 80 },
      scale: { start: 0.45, end: 0.9 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 300,
      frequency: 35,
      emitting: false,
      blendMode: 'NORMAL',
    }).setDepth(6);
  }

  /**
   * Synchronized 3-2-1-GO race countdown for all 4 competitors
   */
  private startCountdownSequence(width: number, height: number): void {
    this.isCountdownActive = true;
    this.countdownValue = 3;

    this.countdownText = this.add.text(width / 2, height / 2 - 40, '3', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '110px',
      color: CYBER_THEME.CRIMSON_HEX,
      stroke: CYBER_THEME.BG_DARK_HEX,
      strokeThickness: 12,
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(150)
      .setScrollFactor(0);

    SoundEffects.playCountdownBeep(false);
    this.animateCountdownNumber();

    const timer = this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        this.countdownValue--;
        if (this.countdownValue === 2) {
          this.countdownText.setText('2');
          this.countdownText.setColor(CYBER_THEME.PURPLE_HEX);
          SoundEffects.playCountdownBeep(false);
          this.animateCountdownNumber();
        } else if (this.countdownValue === 1) {
          this.countdownText.setText('1');
          this.countdownText.setColor(CYBER_THEME.CYAN_HEX);
          SoundEffects.playCountdownBeep(false);
          this.animateCountdownNumber();
        } else if (this.countdownValue === 0) {
          this.countdownText.setText('GO!');
          this.countdownText.setColor(CYBER_THEME.EMERALD_HEX);
          SoundEffects.playCountdownBeep(true);
          this.animateCountdownNumber();

          // Simultaneously unlock player & AI vehicles
          this.isCountdownActive = false;
          this.raceManager.startRace();

          // Camera flash on launch (Emerald / Mint)
          this.cameras.main.flash(200, 0, 255, 157);

          // Fade out countdown text
          this.time.delayedCall(700, () => {
            this.tweens.add({
              targets: this.countdownText,
              alpha: 0,
              scale: 1.5,
              duration: 300,
              onComplete: () => {
                this.countdownText.destroy();
                timer.destroy();
              },
            });
          });
        }
      },
    });
  }

  private animateCountdownNumber(): void {
    this.countdownText.setScale(2.0);
    this.countdownText.setAlpha(1);

    this.tweens.add({
      targets: this.countdownText,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 380,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Creates the fixed cyberpunk racing HUD with Live Leaderboard
   */
  private createRaceHUD(width: number, height: number): void {
    this.hudContainer = this.add.container(0, 0).setDepth(100).setScrollFactor(0);

    // 1. Top Left: Circuit & Machine Info Pill
    const infoBg = this.add.graphics();
    infoBg.fillStyle(CYBER_THEME.BG_GLASS, 0.92);
    infoBg.fillRoundedRect(24, 20, 270, 68, 6);
    infoBg.lineStyle(1.5, CYBER_THEME.CYAN, 0.6);
    infoBg.strokeRoundedRect(24, 20, 270, 68, 6);
    // Accent corner ticks in purple
    infoBg.lineStyle(2, CYBER_THEME.PURPLE, 0.9);
    infoBg.lineBetween(24, 28, 24, 20);
    infoBg.lineBetween(24, 20, 32, 20);
    this.hudContainer.add(infoBg);

    const circuitName = this.add.text(40, 32, this.selectedTrack.name.toUpperCase(), {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '15px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });

    const carName = this.add.text(40, 56, `${this.selectedCar.name} [${this.selectedCar.class.split('//')[0].trim()}]`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    });

    const diffBadge = this.add.text(278, 34, this.selectedDifficulty.id, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: this.selectedDifficulty.id === 'EASY'
        ? CYBER_THEME.EMERALD_HEX
        : this.selectedDifficulty.id === 'MEDIUM' ? CYBER_THEME.CYAN_HEX : CYBER_THEME.CRIMSON_HEX,
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.hudContainer.add([circuitName, carName, diffBadge]);

    // 2. Left Side (below info pill): Live Standings & Position Leaderboard Card
    const lbW = 270;
    const lbH = 132;
    const lbX = 24;
    const lbY = 96;

    this.leaderboardContainer = this.add.container(lbX, lbY);
    const lbBg = this.add.graphics();
    lbBg.fillStyle(CYBER_THEME.BG_GLASS, 0.92);
    lbBg.fillRoundedRect(0, 0, lbW, lbH, 6);
    lbBg.lineStyle(1.5, CYBER_THEME.CYAN, 0.6);
    lbBg.strokeRoundedRect(0, 0, lbW, lbH, 6);
    // Purple accent top border line
    lbBg.lineStyle(2, CYBER_THEME.PURPLE, 0.9);
    lbBg.lineBetween(0, 0, 40, 0);
    this.leaderboardContainer.add(lbBg);

    const lbTitle = this.add.text(14, 10, 'LIVE STANDINGS', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#94a3b8',
      fontStyle: 'bold',
      letterSpacing: 1.5,
    });

    this.playerPosBadgeText = this.add.text(lbW - 14, 8, 'POS: 1 / 4', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '14px',
      color: CYBER_THEME.CYAN_HEX,
      letterSpacing: 1,
    }).setOrigin(1, 0);

    this.leaderboardContainer.add([lbTitle, this.playerPosBadgeText]);

    // 4 rows for positions 1 to 4
    this.leaderboardRows = [];
    const rowStartY = 32;
    const rowH = 23;

    for (let r = 0; r < 4; r++) {
      const ry = rowStartY + r * rowH;
      const rowBg = this.add.graphics();
      this.leaderboardContainer.add(rowBg);

      const posText = this.add.text(14, ry + 2, `${r + 1}`, {
        fontFamily: CYBER_THEME.FONT_DISPLAY,
        fontSize: '13px',
        color: '#94a3b8',
      });

      const nameText = this.add.text(42, ry + 3, '---', {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
      });

      const lapText = this.add.text(lbW - 14, ry + 3, 'L1', {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '10px',
        color: CYBER_THEME.CYAN_HEX,
      }).setOrigin(1, 0);

      this.leaderboardContainer.add([posText, nameText, lapText]);
      this.leaderboardRows.push({ bg: rowBg, posText, nameText, lapText });
    }

    this.hudContainer.add(this.leaderboardContainer);

    // 3. Top Center: Lap Counter, Timers & Progress HUD Panel
    const panelW = 540;
    const panelH = 72;
    const panelX = width / 2;
    const panelY = 56;

    const telemetryPanel = this.add.container(panelX, panelY);
    const telBg = this.add.graphics();
    telBg.fillStyle(CYBER_THEME.BG_NAVY, 0.94);
    telBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 6);
    telBg.lineStyle(1.5, CYBER_THEME.CYAN, 0.7);
    telBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 6);
    // Purple scanner line at top of telemetry panel
    telBg.lineStyle(2, CYBER_THEME.PURPLE, 0.85);
    telBg.lineBetween(-panelW / 4, -panelH / 2, panelW / 4, -panelH / 2);
    telemetryPanel.add(telBg);

    // Lap Counter Badge
    this.lapCounterText = this.add.text(-panelW / 2 + 20, -18, 'LAP 1 / 3', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '20px',
      color: CYBER_THEME.CYAN_HEX,
      letterSpacing: 1,
    });

    // Current Lap Timer
    this.currentLapTimerText = this.add.text(-panelW / 2 + 145, -20, 'CURRENT: 00:00.000', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    });

    // Best Lap Record
    this.bestLapTimerText = this.add.text(-panelW / 2 + 145, 2, 'BEST: --:--.---', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
    });

    // Total Race Time
    this.totalRaceTimerText = this.add.text(panelW / 2 - 20, -20, 'TOTAL: 00:00.000', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '13px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    // Progress percentage
    this.progressPercentText = this.add.text(panelW / 2 - 20, 2, 'PROGRESS: 0%', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    // Progress Bar Track & Fill
    const barW = panelW - 40;
    const barTrack = this.add.graphics();
    barTrack.fillStyle(CYBER_THEME.BG_DARK, 1);
    barTrack.fillRoundedRect(-barW / 2, panelH / 2 - 10, barW, 4, 2);
    barTrack.lineStyle(1, 0x1e293b, 0.6);
    barTrack.strokeRoundedRect(-barW / 2, panelH / 2 - 10, barW, 4, 2);
    telemetryPanel.add(barTrack);

    this.progressBarGraphics = this.add.graphics();
    telemetryPanel.add(this.progressBarGraphics);

    telemetryPanel.add([
      this.lapCounterText,
      this.currentLapTimerText,
      this.bestLapTimerText,
      this.totalRaceTimerText,
      this.progressPercentText,
    ]);
    this.hudContainer.add(telemetryPanel);

    // 4. Top Right: Exit Race Button
    const exitBtn = UIHelpers.createCyberButton({
      scene: this,
      x: width - 100,
      y: 42,
      width: 140,
      height: 36,
      label: 'EXIT RACE',
      icon: '◄',
      isPrimary: false,
      variant: 'secondary',
      onClick: () => this.togglePause(),
    });
    exitBtn.setScrollFactor(0);
    this.hudContainer.add(exitBtn);

    // 5. Bottom Left: Control Hints
    const hintsBg = this.add.graphics();
    hintsBg.fillStyle(CYBER_THEME.BG_GLASS, 0.85);
    hintsBg.fillRoundedRect(24, height - 76, 320, 56, 6);
    hintsBg.lineStyle(1, CYBER_THEME.CYAN, 0.4);
    hintsBg.strokeRoundedRect(24, height - 76, 320, 56, 6);
    this.hudContainer.add(hintsBg);

    const hint1 = this.add.text(38, height - 64, 'STEER: [W/A/S/D] or [ARROWS]', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#cbd5e1',
    });
    const hint2 = this.add.text(38, height - 48, 'DRIFT: [SPACE] // NITRO: [SHIFT] // MENU: [ESC]', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    });
    this.hudContainer.add([hint1, hint2]);

    // 6. Bottom Right: Digital Speedometer & Nitro Cluster
    const clusterX = width - 210;
    const clusterY = height - 110;

    const clusterBg = this.add.graphics();
    clusterBg.fillStyle(CYBER_THEME.BG_NAVY, 0.94);
    clusterBg.fillRoundedRect(clusterX - 30, clusterY - 30, 220, 120, 8);
    clusterBg.lineStyle(1.5, CYBER_THEME.CYAN, 0.7);
    clusterBg.strokeRoundedRect(clusterX - 30, clusterY - 30, 220, 120, 8);
    // Neon purple accent corner
    clusterBg.lineStyle(2, CYBER_THEME.PURPLE, 0.9);
    clusterBg.lineBetween(clusterX + 190, clusterY - 22, clusterX + 190, clusterY - 30);
    clusterBg.lineBetween(clusterX + 178, clusterY - 30, clusterX + 190, clusterY - 30);
    this.hudContainer.add(clusterBg);

    // Speedometer Arc Graphics
    this.speedArcGraphics = this.add.graphics();
    this.hudContainer.add(this.speedArcGraphics);

    // Speed Number
    this.speedNumberText = this.add.text(clusterX + 60, clusterY + 12, '0', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '44px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const kmhLabel = this.add.text(clusterX + 60, clusterY + 42, 'KM / H', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#94a3b8',
      letterSpacing: 2,
    }).setOrigin(0.5);

    // Gear indicator
    this.gearText = this.add.text(clusterX - 10, clusterY + 12, 'N', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '22px',
      color: CYBER_THEME.CYAN_HEX,
    }).setOrigin(0.5);

    // Drift Status Indicator
    this.driftStatusText = this.add.text(clusterX + 60, clusterY - 14, 'GRIP', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#94a3b8',
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0.5);

    this.hudContainer.add([this.speedNumberText, kmhLabel, this.gearText, this.driftStatusText]);

    // Nitro Meter Bar (Horizontal)
    const nitroTrack = this.add.graphics();
    nitroTrack.fillStyle(CYBER_THEME.BG_DARK, 1);
    nitroTrack.fillRoundedRect(clusterX - 15, clusterY + 62, 185, 14, 3);
    nitroTrack.lineStyle(1, 0x1e293b, 0.8);
    nitroTrack.strokeRoundedRect(clusterX - 15, clusterY + 62, 185, 14, 3);
    this.hudContainer.add(nitroTrack);

    this.nitroFillGraphics = this.add.graphics();
    this.hudContainer.add(this.nitroFillGraphics);

    this.nitroPercentText = this.add.text(clusterX + 75, clusterY + 69, 'NITRO 100%', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.hudContainer.add(this.nitroPercentText);
  }

  /**
   * Sets up overlay containers for announcements, wrong-way banner, and lap notices
   */
  private createAnnouncementOverlays(width: number, height: number): void {
    // 1. Wrong Way Warning Banner
    this.wrongWayBanner = this.add.container(width / 2, 140).setDepth(150).setScrollFactor(0);
    const wwBg = this.add.graphics();
    wwBg.fillStyle(CYBER_THEME.BG_NAVY, 0.95);
    wwBg.fillRoundedRect(-160, -20, 320, 40, 6);
    wwBg.lineStyle(2, CYBER_THEME.CRIMSON, 1);
    wwBg.strokeRoundedRect(-160, -20, 320, 40, 6);
    this.wrongWayBanner.add(wwBg);

    const wwText = this.add.text(0, 0, '⚠ WRONG WAY — TURN AROUND ⚠', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '13px',
      color: CYBER_THEME.CRIMSON_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.wrongWayBanner.add(wwText);
    this.wrongWayBanner.setVisible(false);

    // Pulse animation
    this.tweens.add({
      targets: this.wrongWayBanner,
      alpha: 0.4,
      duration: 300,
      yoyo: true,
      repeat: -1,
    });

    // 2. High-Impact Center Announcement Text
    this.announcementText = this.add.text(width / 2, height / 2 - 30, '', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '72px',
      color: CYBER_THEME.PURPLE_HEX,
      stroke: CYBER_THEME.BG_DARK_HEX,
      strokeThickness: 10,
      fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(160).setScrollFactor(0).setAlpha(0);

    // 3. Lap Notice Container
    this.lapNoticeContainer = this.add.container(width / 2, height / 2 - 70).setDepth(155).setScrollFactor(0).setAlpha(0);
    const lnBg = this.add.graphics();
    lnBg.fillStyle(CYBER_THEME.BG_NAVY, 0.94);
    lnBg.fillRoundedRect(-220, -28, 440, 56, 8);
    lnBg.lineStyle(2, CYBER_THEME.CYAN, 0.9);
    lnBg.strokeRoundedRect(-220, -28, 440, 56, 8);
    // Purple accent line on top of lap notice
    lnBg.lineStyle(2, CYBER_THEME.PURPLE, 0.9);
    lnBg.lineBetween(-80, -28, 80, -28);
    this.lapNoticeContainer.add(lnBg);

    const lnTitle = this.add.text(0, -8, '', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '18px',
      color: '#ffffff',
      letterSpacing: 1.5,
    }).setOrigin(0.5);

    const lnSub = this.add.text(0, 14, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.lapNoticeContainer.add([lnTitle, lnSub]);
  }

  /**
   * Main game update loop
   */
  update(_time: number, delta: number): void {
    if (this.isPaused) return;

    const dt = delta / 1000;

    // 1. Gather player inputs
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

    // 2. Save previous player coordinates
    const prevPlayerX = this.player.x;
    const prevPlayerY = this.player.y;

    // 3. Update Player Vehicle Physics with Track Surface Physics
    const isOnTrack = this.track.isPointOnTrack(this.player.x, this.player.y);
    this.player.update(
      dt,
      inputs,
      this.isCountdownActive,
      isOnTrack,
      this.track.worldWidth,
      this.track.worldHeight,
      this.track.physics
    );

    // 4. Update Race Manager for Player
    this.raceManager.update(dt, this.player.x, this.player.y, prevPlayerX, prevPlayerY, this.player.rotation);

    // 5. Build sensory collision snapshot for AI avoidance
    const allVehicles: VehicleCollisionData[] = [
      {
        id: 'player',
        x: this.player.x,
        y: this.player.y,
        vx: this.player.vx,
        vy: this.player.vy,
        isPlayer: true,
        radius: 24,
      },
      ...this.aiOpponents.map((ai) => ({
        id: ai.id,
        x: ai.x,
        y: ai.y,
        vx: ai.vx,
        vy: ai.vy,
        isPlayer: false,
        radius: 24,
      })),
    ];

    // 6. Update AI Opponents & Checkpoints
    for (const ai of this.aiOpponents) {
      const prevAiX = ai.x;
      const prevAiY = ai.y;

      ai.update(dt, this.track, allVehicles, this.isCountdownActive);
      this.raceManager.updateAI(ai.id, dt, ai.x, ai.y, prevAiX, prevAiY);
    }

    // 7. Pairwise Vehicle Collisions (Arcade Impulse & Anti-Overlap)
    this.handleVehicleCollisions();

    // 8. Visual FX (Skid marks, exhaust flames, tire smoke)
    this.updateVehicleVisualFX();

    // 9. Update Track Environmental Animations
    this.track.update(dt);

    // 10. Dynamic Camera Zoom & Smooth Reverse Lookahead Lead
    const currentSpeedRatio = Math.min(this.player.currentSpeedKMH / 320, 1.0);
    const targetZoom = 1.05 - currentSpeedRatio * 0.16;
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05);

    // Smooth Reverse / Forward Lookahead Lead (no abrupt snapping)
    const isReversing = this.player.forwardSpeed < -12 || this.player.isReverseGear;
    let targetLead = 0;
    if (isReversing) {
      targetLead = -75;
    } else {
      const speedFactor = Math.min(1.0, Math.max(0, this.player.forwardSpeed / 200));
      targetLead = speedFactor * 65;
    }

    const targetOffsetX = Math.cos(this.player.rotation) * targetLead;
    const targetOffsetY = Math.sin(this.player.rotation) * targetLead;
    this.cameraLeadX = Phaser.Math.Linear(this.cameraLeadX, targetOffsetX, 0.05);
    this.cameraLeadY = Phaser.Math.Linear(this.cameraLeadY, targetOffsetY, 0.05);
    this.cameras.main.setFollowOffset(this.cameraLeadX, this.cameraLeadY);

    // Camera shake during nitro boost (respect screenShakeEnabled setting)
    if (
      settingsManager.getSettings().screenShakeEnabled &&
      this.player.isNitroActive &&
      inputs.throttle > 0 &&
      !this.isRaceFinished
    ) {
      this.cameras.main.shake(80, 0.002);
    }

    // 11. Update HUD (Speedometer & Live Leaderboard)
    this.updateHUD();

    // 12. Update Minimap Dynamic Pips
    this.updateMinimap();

    // 13. Update AI Opponent Direction Chevrons
    this.updateOpponentChevrons();

    // 14. Speed lines feedback
    this.updateSpeedFeedback(currentSpeedRatio);
  }

  /**
   * Pairwise Vehicle Collision Detection & Response
   * Resolves vehicle overlap and applies arcade momentum exchange with speed-adaptive impulses,
   * tangential friction, and two-pass positional relaxation for multi-car packs.
   */
  public handleVehicleCollisions(): void {
    const minDistance = 44; // combined bounding diameter (radius 22px each)
    let playerCollided = false;

    // Build vehicle proxy array with direct mutation of proxy state
    const vehicles = [
      {
        id: 'player',
        x: this.player.x,
        y: this.player.y,
        vx: this.player.vx,
        vy: this.player.vy,
        massKg: this.player.massKg || 1240,
        isPlayer: true,
        deflectRotation: (delta: number) => {
          this.player.rotation += delta;
        },
      },
      ...this.aiOpponents.map((ai) => ({
        id: ai.id,
        x: ai.x,
        y: ai.y,
        vx: ai.vx,
        vy: ai.vy,
        massKg: ai.massKg || 1250,
        isPlayer: false,
        deflectRotation: (delta: number) => {
          ai.rotation += delta;
        },
      })),
    ];

    // =========================================================================
    // PASS 1: Primary Overlap Separation + Momentum & Friction Impulse Exchange
    // =========================================================================
    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        const vA = vehicles[i];
        const vB = vehicles[j];

        const dx = vB.x - vA.x;
        const dy = vB.y - vA.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistance * minDistance && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDistance - dist;

          const nx = dx / dist;
          const ny = dy / dist;

          const mA = vA.massKg;
          const mB = vB.massKg;
          const totalMass = mA + mB;
          const wA = mB / totalMass;
          const wB = mA / totalMass;

          // 1. Position Separation: Displace inversely proportional to mass
          const sep = overlap * 1.02;
          vA.x -= nx * sep * wA;
          vA.y -= ny * sep * wA;
          vB.x += nx * sep * wB;
          vB.y += ny * sep * wB;

          // 2. Relative Velocity along Collision Normal
          const relVx = vB.vx - vA.vx;
          const relVy = vB.vy - vA.vy;
          const velAlongNormal = relVx * nx + relVy * ny;

          if (velAlongNormal < 0) {
            // Speed-adaptive restitution: crisp at low speed (0.35), firm & controlled at high speeds (0.20)
            const restitution = Math.max(0.20, 0.35 - Math.abs(velAlongNormal) * 0.00012);
            let impulseScalar = -(1 + restitution) * velAlongNormal;

            // Adaptive impulse cap eliminates high-speed chatter without runaway forces
            const maxImpulse = Math.max(420, Math.abs(velAlongNormal) * 1.25);
            impulseScalar = Math.min(impulseScalar, maxImpulse);

            // Apply normal impulse
            vA.vx -= nx * impulseScalar * wA;
            vA.vy -= ny * impulseScalar * wA;
            vB.vx += nx * impulseScalar * wB;
            vB.vy += ny * impulseScalar * wB;

            // 3. Tangential Linear Friction (Sideswipe scrub and momentum exchange)
            const tangentX = -ny;
            const tangentY = nx;
            const velAlongTangent = relVx * tangentX + relVy * tangentY;

            // Coulomb friction bounded by normal impulse and relative slip speed
            const frictionCoeff = 0.18;
            const maxFriction = impulseScalar * frictionCoeff;
            const frictionMagnitude = Math.min(Math.abs(velAlongTangent) * 0.35, maxFriction);
            const frictionScalar = -Math.sign(velAlongTangent) * frictionMagnitude;

            vA.vx -= tangentX * frictionScalar * wA;
            vA.vy -= tangentY * frictionScalar * wA;
            vB.vx += tangentX * frictionScalar * wB;
            vB.vy += tangentY * frictionScalar * wB;

            // Contact kinetic scrub (mild kinetic energy loss from metal grinding)
            const scrubDamping = Math.min(0.035, (impulseScalar / 1000) * 0.02);
            if (scrubDamping > 0.001) {
              vA.vx -= vA.vx * scrubDamping * wA;
              vA.vy -= vA.vy * scrubDamping * wA;
              vB.vx -= vB.vx * scrubDamping * wB;
              vB.vy -= vB.vy * scrubDamping * wB;
            }

            // 4. Angular Rotational Deflection
            const lateralA = (vA.vx * tangentX + vA.vy * tangentY) * 0.0006;
            vA.deflectRotation(lateralA * wA * 2.0);
            vB.deflectRotation(-lateralA * wB * 2.0);

            if (vA.isPlayer || vB.isPlayer) {
              playerCollided = true;
            }
          }
        }
      }
    }

    // =========================================================================
    // PASS 2: Positional Relaxation Solver (Resolves Multi-Car Pack Secondary Overlaps)
    // NOTE: Does NOT re-apply velocity impulses to prevent double-kicks or jitter
    // =========================================================================
    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        const vA = vehicles[i];
        const vB = vehicles[j];

        const dx = vB.x - vA.x;
        const dy = vB.y - vA.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistance * minDistance && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDistance - dist;

          const nx = dx / dist;
          const ny = dy / dist;

          const mA = vA.massKg;
          const mB = vB.massKg;
          const totalMass = mA + mB;
          const wA = mB / totalMass;
          const wB = mA / totalMass;

          // Resolve remaining overlap cleanly
          const sep = overlap * 1.02;
          vA.x -= nx * sep * wA;
          vA.y -= ny * sep * wA;
          vB.x += nx * sep * wB;
          vB.y += ny * sep * wB;
        }
      }
    }

    // Write resolved states back to actual Player and AI controllers
    this.player.x = vehicles[0].x;
    this.player.y = vehicles[0].y;
    this.player.vx = vehicles[0].vx;
    this.player.vy = vehicles[0].vy;
    this.player.syncSprite();

    for (let k = 0; k < this.aiOpponents.length; k++) {
      const ai = this.aiOpponents[k];
      const v = vehicles[k + 1];
      ai.x = v.x;
      ai.y = v.y;
      ai.vx = v.vx;
      ai.vy = v.vy;
      ai.syncSprite();
    }

    // Audio thud on collision
    if (playerCollided && this.time.now - this.lastBumpSoundTime > 180) {
      SoundEffects.playCarBump();
      if (settingsManager.getSettings().screenShakeEnabled) {
        this.cameras.main.shake(60, 0.0018);
      }
      this.lastBumpSoundTime = this.time.now;
    }
  }

  /**
   * Updates tire skids with 14-second fading buffer, exhaust flames, and tire smoke
   */
  private updateVehicleVisualFX(): void {
    const rearTires = this.player.getRearTireWorldPositions();
    const now = this.time.now / 1000;

    if (rearTires && !this.isCountdownActive) {
      // Record rubber skid trails into segmented buffer
      if (this.prevLeftTire && this.prevRightTire) {
        const skidAlpha = Math.min(0.55, rearTires.intensity * 0.55);
        this.skidSegments.push({
          x1: this.prevLeftTire.x,
          y1: this.prevLeftTire.y,
          x2: rearTires.left.x,
          y2: rearTires.left.y,
          alpha: skidAlpha,
          birthTime: now,
        });
        this.skidSegments.push({
          x1: this.prevRightTire.x,
          y1: this.prevRightTire.y,
          x2: rearTires.right.x,
          y2: rearTires.right.y,
          alpha: skidAlpha,
          birthTime: now,
        });
      }
      this.prevLeftTire = rearTires.left;
      this.prevRightTire = rearTires.right;

      // Tire smoke puff
      if (this.tireSmokeEmitter) {
        this.tireSmokeEmitter.emitParticleAt(rearTires.left.x, rearTires.left.y);
        this.tireSmokeEmitter.emitParticleAt(rearTires.right.x, rearTires.right.y);
      }

      if (rearTires.intensity > 0.6) {
        SoundEffects.playDriftScreech();
      }
    } else {
      this.prevLeftTire = null;
      this.prevRightTire = null;
    }

    // Prune and redraw fading skid marks buffer
    this.updateSkidMarks(now);

    // Nitro Exhaust Flames
    const exhaust = this.player.getExhaustWorldPositions();
    if (this.player.isNitroActive && !this.isCountdownActive && !this.isRaceFinished) {
      if (this.exhaustEmitterLeft && this.exhaustEmitterRight) {
        const flameAngle = this.player.rotation + Math.PI;
        const speed = 180;
        const vx = Math.cos(flameAngle) * speed;
        const vy = Math.sin(flameAngle) * speed;

        this.exhaustEmitterLeft.setPosition(exhaust.left.x, exhaust.left.y);
        this.exhaustEmitterLeft.setParticleSpeed(vx, vy);
        this.exhaustEmitterLeft.emitting = true;

        this.exhaustEmitterRight.setPosition(exhaust.right.x, exhaust.right.y);
        this.exhaustEmitterRight.setParticleSpeed(vx, vy);
        this.exhaustEmitterRight.emitting = true;
      }
    } else {
      if (this.exhaustEmitterLeft) this.exhaustEmitterLeft.emitting = false;
      if (this.exhaustEmitterRight) this.exhaustEmitterRight.emitting = false;
    }
  }

  /**
   * Prunes expired skid segments and redraws active segments with age-based alpha fade
   */
  private updateSkidMarks(now: number): void {
    const cutoff = now - RaceScene.SKID_LIFETIME;

    // Prune expired segments from head of array
    while (this.skidSegments.length > 0 && this.skidSegments[0].birthTime < cutoff) {
      this.skidSegments.shift();
    }

    // Safety clamp to prevent memory issues
    if (this.skidSegments.length > 1200) {
      this.skidSegments.splice(0, this.skidSegments.length - 1200);
    }

    this.skidGraphics.clear();
    for (let i = 0; i < this.skidSegments.length; i++) {
      const seg = this.skidSegments[i];
      const age = now - seg.birthTime;
      const ratio = 1.0 - (age / RaceScene.SKID_LIFETIME);
      if (ratio <= 0) continue;

      this.skidGraphics.lineStyle(5.5, 0x090c14, seg.alpha * ratio);
      this.skidGraphics.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
    }
  }

  /**
   * Refreshes the Digital Speedometer, Nitro Cluster, and Live Leaderboard
   */
  public updateHUD(): void {
    // 1. Lap Counter
    this.lapCounterText.setText(`LAP ${this.raceManager.currentLap} / ${this.raceManager.totalLaps}`);
    if (this.raceManager.currentLap === this.raceManager.totalLaps) {
      this.lapCounterText.setColor(CYBER_THEME.PURPLE_HEX);
    } else {
      this.lapCounterText.setColor(CYBER_THEME.CYAN_HEX);
    }

    // 2. Timers
    this.currentLapTimerText.setText(`CURRENT: ${formatLapTime(this.raceManager.currentLapTime)}`);
    this.bestLapTimerText.setText(`BEST: ${formatLapTime(this.raceManager.bestLapTime)}`);
    this.totalRaceTimerText.setText(`TOTAL: ${formatLapTime(this.raceManager.totalRaceTime)}`);

    // 3. Progress Percentage & Bar
    const progressPct = this.raceManager.getTotalRaceProgressPercent();
    this.progressPercentText.setText(`PROGRESS: ${progressPct}%`);

    const panelW = 540;
    const barW = panelW - 40;
    const fillW = Math.max(0, (progressPct / 100) * barW);

    this.progressBarGraphics.clear();
    const barColor = this.raceManager.currentLap === 3 ? CYBER_THEME.PURPLE : CYBER_THEME.CYAN;
    this.progressBarGraphics.fillStyle(barColor, 0.95);
    this.progressBarGraphics.fillRoundedRect(-barW / 2, 36 - 10, fillW, 4, 2);

    // 4. Live Leaderboard Update
    const leaderboard = this.raceManager.getLeaderboard();
    const playerPos = this.raceManager.getPlayerPosition();
    this.playerPosBadgeText.setText(`POS: ${playerPos} / 4`);
    this.playerPosBadgeText.setColor(playerPos === 1 ? CYBER_THEME.CYAN_HEX : (playerPos <= 2 ? CYBER_THEME.PURPLE_HEX : '#cbd5e1'));

    for (let i = 0; i < 4; i++) {
      const comp = leaderboard[i];
      const row = this.leaderboardRows[i];
      if (!comp || !row) continue;

      row.bg.clear();
      if (comp.isPlayer) {
        row.bg.fillStyle(0x0f2444, 0.95);
        row.bg.fillRoundedRect(6, 32 + i * 23, 270 - 12, 21, 3);
        row.bg.lineStyle(1.5, CYBER_THEME.CYAN, 0.9);
        row.bg.strokeRoundedRect(6, 32 + i * 23, 270 - 12, 21, 3);

        row.posText.setColor(CYBER_THEME.CYAN_HEX);
        row.nameText.setText(`► ${comp.name}`);
        row.nameText.setColor(CYBER_THEME.CYAN_HEX);
      } else {
        row.posText.setColor(i === 0 ? CYBER_THEME.PURPLE_HEX : '#94a3b8');
        row.nameText.setText(`  ${comp.name}`);
        row.nameText.setColor(i === 0 ? '#ffffff' : '#94a3b8');
      }

      const lapDisplay = comp.isFinished ? 'FIN' : `L${comp.currentLap}`;
      row.lapText.setText(lapDisplay);
      row.lapText.setColor(comp.isFinished ? CYBER_THEME.EMERALD_HEX : CYBER_THEME.CYAN_HEX);
    }

    // 5. Wrong Way Banner Visibility
    this.wrongWayBanner.setVisible(this.raceManager.isWrongWay && !this.isRaceFinished);

    // 6. Speedometer & Gauges
    const kmh = this.player.currentSpeedKMH;
    this.speedNumberText.setText(kmh.toString());

    if (kmh > 260) {
      this.speedNumberText.setColor(CYBER_THEME.PURPLE_HEX);
    } else if (kmh > 180) {
      this.speedNumberText.setColor(CYBER_THEME.CYAN_HEX);
    } else {
      this.speedNumberText.setColor('#ffffff');
    }

    // Gear indicator
    if (this.player.isNitroActive) {
      this.gearText.setText('NITRO');
      this.gearText.setColor(CYBER_THEME.PURPLE_HEX);
    } else if (this.player.isReverseGear || this.player.forwardSpeed < -5) {
      this.gearText.setText('R');
      this.gearText.setColor(CYBER_THEME.CRIMSON_HEX);
    } else if (this.player.forwardSpeed > 8) {
      this.gearText.setText('D');
      this.gearText.setColor(CYBER_THEME.CYAN_HEX);
    } else {
      this.gearText.setText('N');
      this.gearText.setColor('#94a3b8');
    }

    // Drift status label
    if (this.player.isDrifting) {
      this.driftStatusText.setText(this.player.driftAngleDeg > 15 ? 'POWERSLIDE' : 'DRIFTING');
      this.driftStatusText.setColor(CYBER_THEME.PURPLE_HEX);
    } else {
      this.driftStatusText.setText('TRACTION');
      this.driftStatusText.setColor('#94a3b8');
    }

    // Nitro Meter Bar Fill
    const nitroPct = Math.round((this.player.nitroAmount / this.player.maxNitro) * 100);
    this.nitroPercentText.setText(`NITRO ${nitroPct}%`);

    const { width, height } = this.scale;
    const clusterX = width - 210;
    const clusterY = height - 110;
    const maxBarW = 181;
    const currentBarW = Math.max(0, (nitroPct / 100) * maxBarW);

    this.nitroFillGraphics.clear();
    const nitroColor = this.player.isNitroActive ? CYBER_THEME.PURPLE : CYBER_THEME.CYAN;
    this.nitroFillGraphics.fillStyle(nitroColor, 0.95);
    this.nitroFillGraphics.fillRoundedRect(clusterX - 13, clusterY + 64, currentBarW, 10, 2);
  }

  private flashCheckpointNotice(cpIndex: number): void {
    if (cpIndex === 0) return;
    this.progressPercentText.setColor(CYBER_THEME.EMERALD_HEX);
    this.time.delayedCall(300, () => {
      this.progressPercentText.setColor(CYBER_THEME.CYAN_HEX);
    });
  }

  /**
   * Displays high-energy visual feedback when drift mini-turbo reward triggers
   */
  private showMiniTurboNotice(boostAmount: number): void {
    const { width, height } = this.scale;
    const miniTurboText = this.add.text(width / 2, height - 170, `⚡ MINI-TURBO +${boostAmount}% ⚡`, {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '24px',
      color: CYBER_THEME.CYAN_HEX,
      stroke: CYBER_THEME.BG_DARK_HEX,
      strokeThickness: 5,
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(160).setScrollFactor(0);

    // Floating ascension and fade out
    this.tweens.add({
      targets: miniTurboText,
      y: height - 215,
      alpha: { from: 1, to: 0 },
      scaleX: { from: 0.85, to: 1.25 },
      scaleY: { from: 0.85, to: 1.25 },
      duration: 750,
      ease: 'Power2.easeOut',
      onComplete: () => {
        miniTurboText.destroy();
      },
    });

    // Subtle cyan camera flare
    this.cameras.main.flash(110, 0, 240, 255);
  }

  private showLapCompleteNotice(lapNumber: number, lapTimeMs: number, isBest: boolean): void {
    const titleText = this.lapNoticeContainer.getAt(1) as Phaser.GameObjects.Text;
    const subText = this.lapNoticeContainer.getAt(2) as Phaser.GameObjects.Text;

    titleText.setText(`LAP ${lapNumber} COMPLETED`);
    titleText.setColor(isBest ? CYBER_THEME.PURPLE_HEX : '#ffffff');

    const formatted = formatLapTime(lapTimeMs);
    subText.setText(isBest ? `★ BEST LAP: ${formatted}` : `TIME: ${formatted}`);
    subText.setColor(isBest ? CYBER_THEME.CYAN_HEX : '#00f3ff');

    this.lapNoticeContainer.setAlpha(1);
    this.lapNoticeContainer.setScale(1.1);

    this.tweens.add({
      targets: this.lapNoticeContainer,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 250,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(1600, () => {
      this.tweens.add({
        targets: this.lapNoticeContainer,
        alpha: 0,
        y: this.lapNoticeContainer.y - 20,
        duration: 300,
        onComplete: () => {
          this.lapNoticeContainer.y += 20;
        },
      });
    });
  }

  private triggerFinalLapAnnouncement(): void {
    if (settingsManager.getSettings().screenShakeEnabled) {
      this.cameras.main.shake(300, 0.005);
    }

    this.announcementText.setText('⚡ FINAL LAP! ⚡');
    this.announcementText.setColor(CYBER_THEME.PURPLE_HEX);
    this.announcementText.setScale(0.5);
    this.announcementText.setAlpha(1);

    this.tweens.add({
      targets: this.announcementText,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 350,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: this.announcementText,
            alpha: 0,
            scaleX: 1.6,
            scaleY: 1.6,
            duration: 300,
          });
        });
      },
    });
  }

  private handleRaceFinished(results: RaceResultData): void {
    this.isRaceFinished = true;
    SoundEffects.playFinishRace();
    this.cameras.main.flash(400, 0, 255, 157);

    const playerPos = results.playerPosition;
    const bannerText = playerPos === 1 ? '🏁 VICTORY! 1ST PLACE 🏁' : `🏁 FINISH! POS: ${playerPos}/4 🏁`;
    this.announcementText.setText(bannerText);
    this.announcementText.setColor(playerPos === 1 ? CYBER_THEME.CYAN_HEX : CYBER_THEME.EMERALD_HEX);
    this.announcementText.setScale(0.6);
    this.announcementText.setAlpha(1);

    this.tweens.add({
      targets: this.announcementText,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // Wait 2.2 seconds, then transition to ResultsScene
    this.time.delayedCall(2200, () => {
      this.cameras.main.fadeOut(400, 7, 10, 20);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.cleanUpEntities();
        this.scene.start('ResultsScene', results);
      });
    });
  }

  private updateSpeedFeedback(speedRatio: number): void {
    this.speedFeedbackGraphics.clear();
    if (!settingsManager.getSettings().speedStreaksEnabled || speedRatio < 0.65) return;

    const { width, height } = this.scale;
    const intensity = (speedRatio - 0.65) / 0.35;
    const lineCount = Math.floor(intensity * 12);

    this.speedFeedbackGraphics.lineStyle(2, 0x00f0ff, intensity * 0.35);

    for (let i = 0; i < lineCount; i++) {
      const y = (i * 65 + (this.time.now * 0.6) % 65) % height;
      this.speedFeedbackGraphics.lineBetween(0, y, 60 * intensity, y);
    }

    for (let i = 0; i < lineCount; i++) {
      const y = (i * 65 + 30 + (this.time.now * 0.6) % 65) % height;
      this.speedFeedbackGraphics.lineBetween(width, y, width - 60 * intensity, y);
    }
  }

  private togglePause(): void {
    if (this.isPaused) {
      this.resumeRace();
    } else {
      this.pauseRace();
    }
  }

  private pauseRace(): void {
    SoundEffects.playModalOpen();
    this.isPaused = true;

    const { width, height } = this.scale;
    this.pauseContainer = this.add.container(width / 2, height / 2).setDepth(200).setScrollFactor(0);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.82);
    backdrop.fillRect(-width / 2, -height / 2, width, height);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    this.pauseContainer.add(backdrop);

    const modalW = 460;
    const modalH = 320;
    const frame = this.add.graphics();
    frame.fillStyle(CYBER_THEME.BG_NAVY, 0.98);
    frame.fillRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 8);
    frame.lineStyle(2, CYBER_THEME.CYAN, 0.85);
    frame.strokeRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 8);
    // Neon purple header strip
    frame.lineStyle(3, CYBER_THEME.PURPLE, 0.95);
    frame.lineBetween(-modalW / 3, -modalH / 2, modalW / 3, -modalH / 2);
    this.pauseContainer.add(frame);

    const title = this.add.text(0, -modalH / 2 + 32, 'RACE PAUSED', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '22px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.pauseContainer.add(title);

    const subtitle = this.add.text(
      0,
      -modalH / 2 + 65,
      `// ${this.selectedTrack.name.toUpperCase()} • ${this.selectedCar.name} //`,
      {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '11px',
        color: CYBER_THEME.CYAN_HEX,
      }
    ).setOrigin(0.5);
    this.pauseContainer.add(subtitle);

    const resumeBtn = UIHelpers.createCyberButton({
      scene: this,
      x: 0,
      y: -20,
      width: 280,
      height: 44,
      label: 'RESUME RACE',
      icon: '▶',
      isPrimary: true,
      variant: 'primary',
      onClick: () => this.resumeRace(),
    });
    this.pauseContainer.add(resumeBtn);

    const restartBtn = UIHelpers.createCyberButton({
      scene: this,
      x: 0,
      y: 40,
      width: 280,
      height: 40,
      label: 'RESTART CIRCUIT',
      icon: '↺',
      isPrimary: false,
      variant: 'secondary',
      onClick: () => this.restartRace(),
    });
    this.pauseContainer.add(restartBtn);

    const exitBtn = UIHelpers.createCyberButton({
      scene: this,
      x: 0,
      y: 95,
      width: 280,
      height: 40,
      label: 'EXIT TO MAIN MENU',
      icon: '✕',
      isPrimary: false,
      variant: 'danger',
      onClick: () => this.exitToMainMenu(),
    });
    this.pauseContainer.add(exitBtn);

    this.pauseContainer.setScale(0.85);
    this.pauseContainer.setAlpha(0);
    this.tweens.add({
      targets: this.pauseContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });
  }

  private resumeRace(): void {
    if (!this.pauseContainer) return;

    SoundEffects.playModalClose();
    this.tweens.add({
      targets: this.pauseContainer,
      scaleX: 0.9,
      scaleY: 0.9,
      alpha: 0,
      duration: 120,
      onComplete: () => {
        this.pauseContainer?.destroy();
        this.pauseContainer = null;
        this.isPaused = false;
      },
    });
  }

  public restartRace(): void {
    SoundEffects.playClick();
    this.cleanUpEntities();
    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart();
    });
  }

  public exitToMainMenu(): void {
    SoundEffects.playClick();
    this.cleanUpEntities();
    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MainMenuScene');
    });
  }

  /**
   * Builds the corner-anchored vector minimap in the top-right quadrant
   */
  private createMinimap(width: number): void {
    const mapW = 190;
    const mapH = 150;
    const mapX = width - 214;
    const mapY = 88;

    this.minimapContainer = this.add.container(mapX, mapY).setDepth(100).setScrollFactor(0);

    // 1. Semi-transparent Cyber Frame
    const frame = this.add.graphics();
    frame.fillStyle(CYBER_THEME.BG_NAVY, 0.9);
    frame.fillRoundedRect(0, 0, mapW, mapH, 6);
    frame.lineStyle(1.5, CYBER_THEME.CYAN, 0.6);
    frame.strokeRoundedRect(0, 0, mapW, mapH, 6);
    // Purple accent top tick
    frame.lineStyle(2, CYBER_THEME.PURPLE, 0.85);
    frame.lineBetween(0, 0, 30, 0);
    this.minimapContainer.add(frame);

    // 2. Header Label
    const title = this.add.text(12, 8, 'RADAR // CIRCUIT', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '9px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
      letterSpacing: 1,
    });
    this.minimapContainer.add(title);

    // 3. Static Circuit Geometry Graphics Layer
    this.minimapTrackGraphics = this.add.graphics();
    this.minimapContainer.add(this.minimapTrackGraphics);

    // Coordinate mapping to fit within inner area while preserving exact aspect ratio
    const padX = 14;
    const padY = 24;
    const innerW = mapW - padX * 2; // 162
    const innerH = mapH - padY - 12; // 114

    const worldW = this.track.worldWidth;
    const worldH = this.track.worldHeight;
    this.minimapScale = Math.min(innerW / worldW, innerH / worldH);
    this.minimapOffsetX = padX + (innerW - worldW * this.minimapScale) / 2;
    this.minimapOffsetY = padY + (innerH - worldH * this.minimapScale) / 2;

    // Draw static track geometry once
    const pts = this.track.spacedPoints;
    if (pts && pts.length > 0) {
      // Outer track corridor
      this.minimapTrackGraphics.lineStyle(4, 0x1e293b, 0.9);
      this.minimapTrackGraphics.beginPath();
      const p0 = pts[0];
      this.minimapTrackGraphics.moveTo(
        this.minimapOffsetX + p0.x * this.minimapScale,
        this.minimapOffsetY + p0.y * this.minimapScale
      );
      for (let i = 1; i < pts.length; i++) {
        this.minimapTrackGraphics.lineTo(
          this.minimapOffsetX + pts[i].x * this.minimapScale,
          this.minimapOffsetY + pts[i].y * this.minimapScale
        );
      }
      this.minimapTrackGraphics.closePath();
      this.minimapTrackGraphics.strokePath();

      // Inner centerline
      this.minimapTrackGraphics.lineStyle(2, CYBER_THEME.CYAN, 0.75);
      this.minimapTrackGraphics.beginPath();
      this.minimapTrackGraphics.moveTo(
        this.minimapOffsetX + p0.x * this.minimapScale,
        this.minimapOffsetY + p0.y * this.minimapScale
      );
      for (let i = 1; i < pts.length; i++) {
        this.minimapTrackGraphics.lineTo(
          this.minimapOffsetX + pts[i].x * this.minimapScale,
          this.minimapOffsetY + pts[i].y * this.minimapScale
        );
      }
      this.minimapTrackGraphics.closePath();
      this.minimapTrackGraphics.strokePath();

      // Start/Finish Gate Marker
      const sfX = this.minimapOffsetX + p0.x * this.minimapScale;
      const sfY = this.minimapOffsetY + p0.y * this.minimapScale;
      this.minimapTrackGraphics.fillStyle(CYBER_THEME.PURPLE, 1.0);
      this.minimapTrackGraphics.fillCircle(sfX, sfY, 3);
    }

    // 4. Dynamic Pips Graphics Layer (cleared and redrawn every frame)
    this.minimapPipsGraphics = this.add.graphics();
    this.minimapContainer.add(this.minimapPipsGraphics);

    // Initial visibility from settings
    this.minimapContainer.setVisible(settingsManager.getSettings().minimapEnabled);
  }

  /**
   * Redraws dynamic vehicle markers on the minimap
   */
  private updateMinimap(): void {
    if (!settingsManager.getSettings().minimapEnabled) {
      if (this.minimapContainer.visible) this.minimapContainer.setVisible(false);
      return;
    }
    if (!this.minimapContainer.visible) this.minimapContainer.setVisible(true);

    this.minimapPipsGraphics.clear();

    // 1. Draw AI Opponents
    for (const ai of this.aiOpponents) {
      const mx = this.minimapOffsetX + ai.x * this.minimapScale;
      const my = this.minimapOffsetY + ai.y * this.minimapScale;

      let color = 0xffffff;
      if (ai.id.includes('viper')) color = CYBER_THEME.PURPLE;
      else if (ai.id.includes('rally')) color = 0xffffff;
      else if (ai.id.includes('titan')) color = CYBER_THEME.CRIMSON;

      this.minimapPipsGraphics.fillStyle(color, 0.95);
      this.minimapPipsGraphics.fillCircle(mx, my, 2.8);
    }

    // 2. Draw Player (Electric Cyan with white core + direction indicator notch)
    const px = this.minimapOffsetX + this.player.x * this.minimapScale;
    const py = this.minimapOffsetY + this.player.y * this.minimapScale;

    // Cyan base
    this.minimapPipsGraphics.fillStyle(CYBER_THEME.CYAN, 1.0);
    this.minimapPipsGraphics.fillCircle(px, py, 3.8);

    // White core
    this.minimapPipsGraphics.fillStyle(0xffffff, 1.0);
    this.minimapPipsGraphics.fillCircle(px, py, 1.6);

    // Direction notch
    const notchLen = 6.5;
    const notchX = px + Math.cos(this.player.rotation) * notchLen;
    const notchY = py + Math.sin(this.player.rotation) * notchLen;
    this.minimapPipsGraphics.lineStyle(1.8, CYBER_THEME.CYAN, 1.0);
    this.minimapPipsGraphics.lineBetween(px, py, notchX, notchY);
  }

  /**
   * Renders edge indicators for nearby AI opponents within 400px outside camera viewport
   */
  private updateOpponentChevrons(): void {
    this.chevronGraphics.clear();

    const cam = this.cameras.main;
    const viewLeft = cam.worldView.x;
    const viewRight = cam.worldView.right;
    const viewTop = cam.worldView.y;
    const viewBottom = cam.worldView.bottom;
    const { width, height } = this.scale;

    // Safe boundary rectangle on screen
    const minX = 40;
    const maxX = width - 40;
    const minY = 95;
    const maxY = height - 85;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const hw = (maxX - minX) / 2;
    const hh = (maxY - minY) / 2;

    for (const ai of this.aiOpponents) {
      // Check if visible inside camera viewport
      const insideX = ai.x >= viewLeft && ai.x <= viewRight;
      const insideY = ai.y >= viewTop && ai.y <= viewBottom;
      if (insideX && insideY) continue; // Already visible

      // Calculate distance from viewport edge
      let dx = 0;
      if (ai.x < viewLeft) dx = viewLeft - ai.x;
      else if (ai.x > viewRight) dx = ai.x - viewRight;

      let dy = 0;
      if (ai.y < viewTop) dy = viewTop - ai.y;
      else if (ai.y > viewBottom) dy = ai.y - viewBottom;

      const distFromView = Math.hypot(dx, dy);
      if (distFromView > 400) continue; // Beyond proximity threshold

      // Direction from screen center in world space to AI
      const camCenterX = cam.worldView.centerX;
      const camCenterY = cam.worldView.centerY;
      const angle = Math.atan2(ai.y - camCenterY, ai.x - camCenterX);

      // Intersect ray with safe HUD bounding box
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const scaleX = cosA !== 0 ? hw / Math.abs(cosA) : 10000;
      const scaleY = sinA !== 0 ? hh / Math.abs(sinA) : 10000;
      const s = Math.min(scaleX, scaleY);

      const edgeX = midX + cosA * s;
      const edgeY = midY + sinA * s;

      // Color based on opponent
      let color = 0xffffff;
      if (ai.id.includes('viper')) color = 0xeab308;
      else if (ai.id.includes('rally')) color = 0xf8fafc;
      else if (ai.id.includes('titan')) color = 0xef4444;

      const alpha = Math.max(0.2, (1.0 - distFromView / 400) * 0.95);

      // Draw directional chevron arrowhead
      const tipX = edgeX;
      const tipY = edgeY;
      const wingLen = 13;
      const wingSpread = 2.45;

      const leftX = tipX - Math.cos(angle - wingSpread) * wingLen;
      const leftY = tipY - Math.sin(angle - wingSpread) * wingLen;
      const rightX = tipX - Math.cos(angle + wingSpread) * wingLen;
      const rightY = tipY - Math.sin(angle + wingSpread) * wingLen;

      this.chevronGraphics.fillStyle(color, alpha);
      this.chevronGraphics.beginPath();
      this.chevronGraphics.moveTo(tipX, tipY);
      this.chevronGraphics.lineTo(leftX, leftY);
      this.chevronGraphics.lineTo(tipX - cosA * 4, tipY - sinA * 4);
      this.chevronGraphics.lineTo(rightX, rightY);
      this.chevronGraphics.closePath();
      this.chevronGraphics.fillPath();

      this.chevronGraphics.lineStyle(1.2, 0x070a14, alpha);
      this.chevronGraphics.strokePath();
    }
  }

  private cleanUpEntities(): void {
    this.aiOpponents.forEach((ai) => ai.destroy());
    this.aiOpponents = [];
    this.skidSegments = [];
    if (this.skidGraphics) this.skidGraphics.clear();
    if (this.minimapContainer) this.minimapContainer.destroy();
    if (this.chevronGraphics) this.chevronGraphics.destroy();
  }
}
