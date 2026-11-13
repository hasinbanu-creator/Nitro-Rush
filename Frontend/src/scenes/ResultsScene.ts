import Phaser from 'phaser';
import { CARS, type CarConfig } from '../data/CarData';
import { TRACKS, type TrackConfig } from '../data/TrackData';
import { DIFFICULTIES, type DifficultyConfig, selectionState, type DifficultyId } from '../state/SelectionState';
import { formatLapTime, type RaceResultData, type CompetitorResult } from '../game/RaceManager';
import { SoundEffects } from '../utils/SoundEffects';
import { UIHelpers, CYBER_THEME } from '../utils/UIHelpers';

export class ResultsScene extends Phaser.Scene {
  public resultData!: RaceResultData;
  public selectedTrack!: TrackConfig;
  public selectedCar!: CarConfig;
  public selectedDifficulty!: DifficultyConfig;

  // Background particles
  private starParticles?: Phaser.GameObjects.Particles.ParticleEmitter;
  public isMultiplayer: boolean = false;

  constructor() {
    super({ key: 'ResultsScene' });
  }

  init(data: Partial<RaceResultData> & { isMultiplayer?: boolean }): void {
    this.isMultiplayer = !!data.isMultiplayer;
    const state = selectionState.getState();

    // Default fallback if scene is launched directly without race payload
    const trackId = data.trackId || state.selectedTrackId;
    const carId = data.carId || state.selectedCarId;
    const difficulty: DifficultyId = data.difficulty || state.selectedDifficulty;

    this.selectedTrack = TRACKS.find((t) => t.id === trackId) || TRACKS[0];
    this.selectedCar = CARS.find((c) => c.id === carId) || CARS[0];
    this.selectedDifficulty = DIFFICULTIES[difficulty] || DIFFICULTIES['MEDIUM'];

    const lapTimesMs = data.lapTimesMs && data.lapTimesMs.length === 3
      ? data.lapTimesMs
      : [35420, 32180, 33540];

    const totalTimeMs = data.totalTimeMs || lapTimesMs.reduce((a, b) => a + b, 0);
    const bestLapMs = data.bestLapMs || Math.min(...lapTimesMs);
    const playerPosition = data.playerPosition || 1;

    // Fallback competitors if not provided
    const competitors: CompetitorResult[] = data.competitors || [
      {
        id: 'player',
        name: 'YOU',
        carId: this.selectedCar.id,
        carName: this.selectedCar.name,
        isPlayer: true,
        finishPosition: playerPosition,
        isFinished: true,
        totalTimeMs,
        bestLapMs,
        lapTimesMs,
        status: 'FINISHED',
      },
      {
        id: 'ai_viper',
        name: 'VIPER R',
        carId: 'viper-r',
        carName: 'VIPER R',
        isPlayer: false,
        finishPosition: playerPosition === 1 ? 2 : 1,
        isFinished: true,
        totalTimeMs: totalTimeMs + 1420,
        bestLapMs: bestLapMs + 320,
        lapTimesMs: [bestLapMs + 600, bestLapMs + 320, bestLapMs + 500],
        status: 'FINISHED',
      },
      {
        id: 'ai_rally',
        name: 'RALLY APEX',
        carId: 'rally-apex',
        carName: 'RALLY APEX',
        isPlayer: false,
        finishPosition: playerPosition <= 2 ? 3 : 2,
        isFinished: true,
        totalTimeMs: totalTimeMs + 2850,
        bestLapMs: bestLapMs + 840,
        lapTimesMs: [bestLapMs + 1100, bestLapMs + 840, bestLapMs + 910],
        status: 'FINISHED',
      },
      {
        id: 'ai_titan',
        name: 'TITAN V8',
        carId: 'titan-v8',
        carName: 'TITAN V8',
        isPlayer: false,
        finishPosition: 4,
        isFinished: true,
        totalTimeMs: totalTimeMs + 4600,
        bestLapMs: bestLapMs + 1450,
        lapTimesMs: [bestLapMs + 1600, bestLapMs + 1450, bestLapMs + 1550],
        status: 'FINISHED',
      },
    ];

    // Ensure competitors are sorted by finishing position 1..4
    competitors.sort((a, b) => a.finishPosition - b.finishPosition);

    this.resultData = {
      trackId: this.selectedTrack.id,
      trackName: this.selectedTrack.name,
      carId: this.selectedCar.id,
      carName: this.selectedCar.name,
      difficulty,
      totalTimeMs,
      bestLapMs,
      lapTimesMs,
      playerPosition,
      competitors,
    };
  }

  create(): void {
    const { width, height } = this.scale;

    // Stop background scenes if they are active
    if (this.scene.isActive('RaceScene')) this.scene.stop('RaceScene');
    if (this.scene.isActive('MainMenuScene')) this.scene.stop('MainMenuScene');

    // 1. Play Triumphant Victory Audio
    SoundEffects.playFinishRace();

    // 2. Cyberpunk Solid Background & Starfield
    this.createCyberBackground(width, height);

    // 3. Header Banner with Finishing Position & Podium Indicator
    this.createHeader(width);

    // Dynamic horizontal layout centering and widescreen scaling
    const totalFixedW = 1180; // 430 + 30 + 720
    let leftW = 430;
    let rightW = 720;
    const gap = 30;
    let startX = Math.max(30, Math.floor((width - totalFixedW) / 2));

    if (width > 1360) {
      // Widescreen: expand right panel slightly and center cleanly
      const extra = Math.min(180, width - totalFixedW - 60);
      rightW += extra;
      startX = Math.floor((width - (leftW + gap + rightW)) / 2);
    } else if (width < 1240) {
      // Narrow screen: scale down
      const available = width - 60;
      leftW = Math.floor(available * 0.38);
      rightW = available - leftW - gap;
      startX = 30;
    }

    // 4. Left Panel: Machine & Track Showcase
    this.createMachinePanel(startX, 115, leftW, 485);

    // 5. Right Panel: Official 4-Car Classification Grid & Telemetry
    this.createClassificationPanel(startX + leftW + gap, 115, rightW, 485);

    // 6. Action Navigation Buttons
    this.createActionButtons(width, height);

    // 7. Keyboard Shortcuts (ENTER/SPACE = Race Again, ESC = Main Menu)
    this.setupKeyboardShortcuts();

    // Fade camera in from black
    this.cameras.main.fadeIn(350, 7, 10, 20);
  }

  /**
   * Deep cyberpunk background with solid base and floating glowing embers
   */
  private createCyberBackground(width: number, height: number): void {
    const bg = this.add.graphics().setDepth(0);
    // 100% solid base background to ensure no underlying scene shows through
    bg.fillStyle(CYBER_THEME.BG_DARK, 1.0);
    bg.fillRect(0, 0, width, height);

    bg.fillGradientStyle(CYBER_THEME.BG_GLASS, CYBER_THEME.BG_GLASS, CYBER_THEME.BG_DARK, CYBER_THEME.BG_DARK, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle diagonal neon grid lines
    bg.lineStyle(1, CYBER_THEME.CYAN, 0.06);
    for (let x = -height; x < width + height; x += 60) {
      bg.lineBetween(x, 0, x + height, height);
    }

    // Glowing particle embers floating upwards
    this.starParticles = this.add.particles(0, 0, 'particle_cyan', {
      x: { min: 0, max: width },
      y: { min: height - 40, max: height + 10 },
      speedY: { min: -25, max: -60 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 5000,
      frequency: 220,
      blendMode: 'ADD',
    }).setDepth(1);
  }

  /**
   * Header title banner with finish position callout
   */
  private createHeader(width: number): void {
    const container = this.add.container(0, 0).setDepth(10);

    const pos = this.resultData.playerPosition;
    let posBanner = 'RACE FINISHED';
    let posColor = '#ffffff';

    if (pos === 1) {
      posBanner = '★ 1ST PLACE — RACE WINNER! ★';
      posColor = CYBER_THEME.AMBER_HEX;
    } else if (pos === 2) {
      posBanner = '★ 2ND PLACE — PODIUM FINISH ★';
      posColor = CYBER_THEME.CYAN_HEX;
    } else if (pos === 3) {
      posBanner = '★ 3RD PLACE — PODIUM FINISH ★';
      posColor = CYBER_THEME.PURPLE_HEX;
    } else {
      posBanner = '// 4TH PLACE — GRID QUALIFIED //';
      posColor = '#cbd5e1';
    }

    const title = this.add.text(width / 2, 42, posBanner, {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '28px',
      color: posColor,
      letterSpacing: 2,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, 76, '// OFFICIAL CIRCUIT TELEMETRY ARCHIVE //', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '12px',
      color: CYBER_THEME.CYAN_HEX,
      letterSpacing: 2,
    }).setOrigin(0.5);

    // Status pill anchored cleanly on the right
    const statusBg = this.add.graphics();
    statusBg.fillStyle(CYBER_THEME.BG_GLASS, 0.9);
    statusBg.fillRoundedRect(width - 264, 38, 224, 32, 6);
    statusBg.lineStyle(1.5, CYBER_THEME.EMERALD, 0.9);
    statusBg.strokeRoundedRect(width - 264, 38, 224, 32, 6);

    const statusText = this.add.text(width - 152, 54, 'STATUS: FINISHED [3/3 LAPS]', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.EMERALD_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([title, subtitle, statusBg, statusText]);
  }

  /**
   * Left Card: Vehicle preview on illuminated pedestal and vehicle / track specifications
   */
  private createMachinePanel(x: number, y: number, w: number, h: number): void {
    const container = this.add.container(x, y).setDepth(10);

    // Card background frame
    const frame = this.add.graphics();
    frame.fillStyle(CYBER_THEME.BG_GLASS, 0.94);
    frame.fillRoundedRect(0, 0, w, h, 8);
    frame.lineStyle(1.5, CYBER_THEME.CYAN, 0.65);
    frame.strokeRoundedRect(0, 0, w, h, 8);
    // Purple accent top strip
    frame.lineStyle(2, CYBER_THEME.PURPLE, 0.9);
    frame.lineBetween(0, 0, 44, 0);
    container.add(frame);

    // Header label
    const cardTitle = this.add.text(20, 16, 'MACHINE & TRACK DOSSIER', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '14px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });
    container.add(cardTitle);

    // Pedestal turntable ring
    const pedX = w / 2;
    const pedY = 120;
    const ped = this.add.graphics();

    ped.lineStyle(3, CYBER_THEME.CYAN, 0.7);
    ped.strokeCircle(pedX, pedY, 68);
    ped.fillStyle(CYBER_THEME.BG_NAVY, 0.9);
    ped.fillCircle(pedX, pedY, 65);
    ped.lineStyle(1.5, CYBER_THEME.PURPLE, 0.85);
    ped.strokeCircle(pedX, pedY, 52);
    container.add(ped);

    // Vehicle Top-Down Sprite
    const carSprite = this.add.sprite(pedX, pedY, this.selectedCar.textureKey);
    carSprite.setScale(0.85);
    carSprite.setAngle(-90);
    container.add(carSprite);

    this.tweens.add({
      targets: carSprite,
      scaleX: 0.89,
      scaleY: 0.89,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Machine Name & Class
    const carName = this.add.text(w / 2, 206, this.selectedCar.name, {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '22px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);

    const carClass = this.add.text(w / 2, 232, this.selectedCar.class, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([carName, carClass]);

    // Mini Performance Bars
    const statsY = 262;
    const stats = [
      { label: 'TOP SPEED', val: this.selectedCar.stats.topSpeed, color: CYBER_THEME.CYAN },
      { label: 'ACCEL', val: this.selectedCar.stats.acceleration, color: CYBER_THEME.PURPLE },
      { label: 'HANDLING', val: this.selectedCar.stats.handling, color: CYBER_THEME.EMERALD },
      { label: 'NITRO', val: this.selectedCar.stats.nitro, color: CYBER_THEME.CYAN },
    ];

    stats.forEach((st, idx) => {
      const sy = statsY + idx * 24;
      const lbl = this.add.text(26, sy, st.label, {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '10px',
        color: '#94a3b8',
        fontStyle: 'bold',
      });

      const barBg = this.add.graphics();
      barBg.fillStyle(CYBER_THEME.BG_DARK, 1);
      barBg.fillRoundedRect(110, sy + 3, w - 140, 8, 2);

      const barFill = this.add.graphics();
      barFill.fillStyle(st.color, 1);
      barFill.fillRoundedRect(110, sy + 3, ((w - 140) * st.val) / 100, 8, 2);

      container.add([lbl, barBg, barFill]);
    });

    // Circuit Divider Line
    const divLine = this.add.graphics();
    divLine.lineStyle(1, 0x1e293b, 0.8);
    divLine.lineBetween(20, 368, w - 20, 368);
    container.add(divLine);

    // Selected Circuit Section
    const trackLabel = this.add.text(26, 382, 'CIRCUIT', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#64748b',
    });

    const trackName = this.add.text(26, 398, this.selectedTrack.name.toUpperCase(), {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '18px',
      color: '#ffffff',
      letterSpacing: 1,
    });

    const trackEnv = this.add.text(26, 426, `ENVIRONMENT: ${this.selectedTrack.environment.toUpperCase()}`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#94a3b8',
    });

    const diffColor = this.selectedDifficulty.id === 'EASY'
      ? CYBER_THEME.EMERALD_HEX
      : this.selectedDifficulty.id === 'MEDIUM' ? CYBER_THEME.CYAN_HEX : CYBER_THEME.CRIMSON_HEX;

    const diffBadge = this.add.text(w - 26, 400, `[${this.selectedDifficulty.id}]`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '12px',
      color: diffColor,
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    const diffDesc = this.add.text(26, 450, `TUNING: ${this.selectedDifficulty.description}`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: CYBER_THEME.CYAN_HEX,
    });

    container.add([trackLabel, trackName, trackEnv, diffBadge, diffDesc]);
  }

  /**
   * Right Card: Official 4-Competitor Classification Standings Table & Telemetry
   */
  private createClassificationPanel(x: number, y: number, w: number, h: number): void {
    const container = this.add.container(x, y).setDepth(10);

    // Panel background frame
    const frame = this.add.graphics();
    frame.fillStyle(CYBER_THEME.BG_GLASS, 0.94);
    frame.fillRoundedRect(0, 0, w, h, 8);
    frame.lineStyle(1.5, CYBER_THEME.CYAN, 0.65);
    frame.strokeRoundedRect(0, 0, w, h, 8);
    // Purple accent top strip
    frame.lineStyle(2, CYBER_THEME.PURPLE, 0.9);
    frame.lineBetween(0, 0, 44, 0);
    container.add(frame);

    // 1. Two Hero Boxes at Top: YOUR TOTAL TIME & YOUR BEST LAP
    const boxW = (w - 60) / 2;

    // TOTAL TIME BOX
    const totalBox = this.add.graphics();
    totalBox.fillStyle(CYBER_THEME.BG_NAVY, 0.95);
    totalBox.fillRoundedRect(24, 16, boxW, 85, 6);
    totalBox.lineStyle(1.5, CYBER_THEME.CYAN, 0.8);
    totalBox.strokeRoundedRect(24, 16, boxW, 85, 6);
    container.add(totalBox);

    const totalLabel = this.add.text(40, 26, 'YOUR TOTAL RACE TIME', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#94a3b8',
      letterSpacing: 1.5,
    });

    const totalValue = this.add.text(40, 46, formatLapTime(this.resultData.totalTimeMs), {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '32px',
      color: '#ffffff',
      letterSpacing: 2,
      fontStyle: 'bold',
    });
    container.add([totalLabel, totalValue]);

    // BEST LAP BOX
    const bestX = 24 + boxW + 12;
    const bestBox = this.add.graphics();
    bestBox.fillStyle(CYBER_THEME.BG_NAVY, 0.95);
    bestBox.fillRoundedRect(bestX, 16, boxW, 85, 6);
    bestBox.lineStyle(1.5, CYBER_THEME.PURPLE, 0.85);
    bestBox.strokeRoundedRect(bestX, 16, boxW, 85, 6);
    container.add(bestBox);

    const bestLabel = this.add.text(bestX + 16, 26, '★ YOUR BEST LAP RECORD', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.PURPLE_HEX,
      letterSpacing: 1.5,
      fontStyle: 'bold',
    });

    const bestValue = this.add.text(bestX + 16, 46, formatLapTime(this.resultData.bestLapMs), {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '32px',
      color: CYBER_THEME.CYAN_HEX,
      letterSpacing: 2,
      fontStyle: 'bold',
    });
    container.add([bestLabel, bestValue]);

    // 2. Official 4-Car Classification Header
    const tableHeaderBg = this.add.graphics();
    tableHeaderBg.fillStyle(CYBER_THEME.BG_DARK, 0.95);
    tableHeaderBg.fillRoundedRect(24, 114, w - 48, 28, 4);
    container.add(tableHeaderBg);

    const colPos = 38;
    const colDriver = 96;
    const colStatus = Math.floor(w * 0.44);
    const colBest = Math.floor(w * 0.58);
    const colTotal = Math.floor(w * 0.75);

    const thPos = this.add.text(colPos, 121, 'POS', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });
    const thDriver = this.add.text(colDriver, 121, 'DRIVER & MACHINE', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });
    const thStatus = this.add.text(colStatus, 121, 'STATUS', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });
    const thBest = this.add.text(colBest, 121, 'BEST LAP', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });
    const thTotal = this.add.text(colTotal, 121, 'TOTAL TIME', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    });
    container.add([thPos, thDriver, thStatus, thBest, thTotal]);

    // 3. Four Competitors Classification Rows
    const rowStartY = 148;
    const rowH = 46;

    this.resultData.competitors.forEach((comp, idx) => {
      const rowY = rowStartY + idx * (rowH + 6);
      const isWinner = comp.finishPosition === 1;
      const isPlayer = comp.isPlayer;

      const rowBg = this.add.graphics();
      if (isPlayer) {
        rowBg.fillStyle(0x0f2444, 0.95);
        rowBg.fillRoundedRect(24, rowY, w - 48, rowH, 4);
        rowBg.lineStyle(1.5, CYBER_THEME.CYAN, 0.9);
        rowBg.strokeRoundedRect(24, rowY, w - 48, rowH, 4);
      } else if (isWinner) {
        rowBg.fillStyle(0x1f1638, 0.9);
        rowBg.fillRoundedRect(24, rowY, w - 48, rowH, 4);
        rowBg.lineStyle(1.5, CYBER_THEME.PURPLE, 0.9);
        rowBg.strokeRoundedRect(24, rowY, w - 48, rowH, 4);
      } else {
        rowBg.fillStyle(CYBER_THEME.BG_NAVY, 0.85);
        rowBg.fillRoundedRect(24, rowY, w - 48, rowH, 4);
        rowBg.lineStyle(1, 0x1e293b, 0.6);
        rowBg.strokeRoundedRect(24, rowY, w - 48, rowH, 4);
      }
      container.add(rowBg);

      // Pos badge (e.g. 1ST, 2ND, 3RD, 4TH)
      const posLabels = ['1ST', '2ND', '3RD', '4TH'];
      const posLabel = posLabels[comp.finishPosition - 1] || `${comp.finishPosition}TH`;
      const posColor = comp.finishPosition === 1 ? CYBER_THEME.PURPLE_HEX : (comp.finishPosition === 2 ? CYBER_THEME.CYAN_HEX : '#ffffff');

      const posObj = this.add.text(colPos, rowY + 14, posLabel, {
        fontFamily: CYBER_THEME.FONT_DISPLAY,
        fontSize: '15px',
        color: posColor,
        fontStyle: 'bold',
      });

      // Driver Name & Car
      const displayName = isPlayer ? `► YOU (${comp.carName})` : `${comp.name} [${comp.carName}]`;
      const nameObj = this.add.text(colDriver, rowY + 10, displayName, {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '12px',
        color: isPlayer ? CYBER_THEME.CYAN_HEX : (isWinner ? CYBER_THEME.PURPLE_HEX : '#ffffff'),
        fontStyle: 'bold',
      });

      const roleSub = this.add.text(
        colDriver,
        rowY + 26,
        isPlayer
          ? 'PLAYER GRID COMPETITOR'
          : (this.isMultiplayer ? `REMOTE PILOT // ${comp.carId.toUpperCase()}` : `AI RIVAL // ${comp.carId.toUpperCase()}`),
        {
          fontFamily: CYBER_THEME.FONT_MONO,
          fontSize: '9px',
          color: '#64748b',
        }
      );

      // Finish / DNF Status
      const statusColor = comp.status === 'FINISHED' ? CYBER_THEME.EMERALD_HEX : CYBER_THEME.CRIMSON_HEX;
      const statusObj = this.add.text(colStatus, rowY + 14, comp.status, {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '11px',
        color: statusColor,
        fontStyle: 'bold',
      });

      // Best Lap
      const bestObj = this.add.text(colBest, rowY + 14, formatLapTime(comp.bestLapMs), {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '13px',
        color: CYBER_THEME.CYAN_HEX,
        fontStyle: 'bold',
      });

      // Total Time
      const totalObj = this.add.text(colTotal, rowY + 14, formatLapTime(comp.totalTimeMs), {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      });

      // Winner Badge Indicator on Right
      if (isWinner) {
        const winnerBadge = this.add.text(w - 36, rowY + 15, '★ WINNER', {
          fontFamily: CYBER_THEME.FONT_MONO,
          fontSize: '11px',
          color: CYBER_THEME.PURPLE_HEX,
          fontStyle: 'bold',
          letterSpacing: 1,
        }).setOrigin(1, 0);
        container.add(winnerBadge);
      }

      container.add([posObj, nameObj, roleSub, statusObj, bestObj, totalObj]);
    });

    // 4. Player Lap Breakdown Mini-Bar (Centered)
    const lapSummaryY = 368;
    const lapSumText = `YOUR SPLIT LAPS:  L1: ${formatLapTime(this.resultData.lapTimesMs[0] || 0)}  //  L2: ${formatLapTime(this.resultData.lapTimesMs[1] || 0)}  //  L3: ${formatLapTime(this.resultData.lapTimesMs[2] || 0)}`;
    const lapSumObj = this.add.text(w / 2, lapSummaryY, lapSumText, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    container.add(lapSumObj);

    // 5. Verification Footer Bar
    const footerY = 405;
    const footerBg = this.add.graphics();
    footerBg.fillStyle(CYBER_THEME.BG_NAVY, 0.92);
    footerBg.fillRoundedRect(24, footerY, w - 48, 55, 4);
    footerBg.lineStyle(1, CYBER_THEME.CYAN, 0.5);
    footerBg.strokeRoundedRect(24, footerY, w - 48, 55, 4);
    container.add(footerBg);

    const footerText1 = this.add.text(
      40,
      footerY + 12,
      this.isMultiplayer
        ? `OFFICIAL MULTIPLAYER CLASSIFICATION: ALL ${this.resultData.competitors.length} RACERS SYNCHRONIZED // SERVER AUTHORITATIVE`
        : 'OFFICIAL GRID CLASSIFICATION: ALL 4 COMPETITORS VALIDATED // FAIR PLAY TELEMETRY',
      {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '10px',
        color: CYBER_THEME.CYAN_HEX,
        fontStyle: 'bold',
      }
    );
    const footerText2 = this.add.text(
      40,
      footerY + 30,
      this.isMultiplayer
        ? 'NETWORKING ENGINE: 20 HZ CLIENT INPUT STREAMING & 3-TIER RECONCILIATION VERIFIED'
        : 'AUTONOMOUS AI RACING ENGINE: DYNAMIC RACING LINES & REAL-TIME COLLISION RESPONSE CONFIRMED',
      {
        fontFamily: CYBER_THEME.FONT_MONO,
        fontSize: '10px',
        color: '#94a3b8',
      }
    );
    container.add([footerText1, footerText2]);
  }

  /**
   * Action buttons: RACE AGAIN & MAIN MENU
   */
  private createActionButtons(width: number, height: number): void {
    const btnY = height - 56;

    // RACE AGAIN (Primary Button)
    const raceAgainBtn = UIHelpers.createCyberButton({
      scene: this,
      x: width / 2 - 130,
      y: btnY,
      width: 240,
      height: 48,
      label: this.isMultiplayer ? 'MULTIPLAYER LOBBY' : 'RACE AGAIN',
      icon: this.isMultiplayer ? '👥' : '↺',
      isPrimary: true,
      variant: 'primary',
      onClick: () => this.handleRaceAgain(),
    });

    // MAIN MENU (Secondary Button)
    const mainMenuBtn = UIHelpers.createCyberButton({
      scene: this,
      x: width / 2 + 130,
      y: btnY,
      width: 220,
      height: 48,
      label: 'MAIN MENU',
      icon: '◄',
      isPrimary: false,
      variant: 'secondary',
      onClick: () => this.handleMainMenu(),
    });

    this.add.existing(raceAgainBtn);
    this.add.existing(mainMenuBtn);
  }

  private setupKeyboardShortcuts(): void {
    if (!this.input.keyboard) return;

    this.input.keyboard.on('keydown-SPACE', () => this.handleRaceAgain());
    this.input.keyboard.on('keydown-ENTER', () => this.handleRaceAgain());
    this.input.keyboard.on('keydown-ESC', () => this.handleMainMenu());
  }

  public handleRaceAgain(): void {
    SoundEffects.playClick();
    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.isMultiplayer) {
        this.scene.start('MultiplayerLobbyScene');
      } else {
        this.scene.start('RaceScene');
      }
    });
  }

  public handleMainMenu(): void {
    SoundEffects.playClick();
    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MainMenuScene');
    });
  }

  destroy(): void {
    this.starParticles?.destroy();
  }
}
