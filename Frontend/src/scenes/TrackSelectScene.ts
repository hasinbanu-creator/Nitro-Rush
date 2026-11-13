import Phaser from 'phaser';
import { TRACKS, type TrackConfig, type CircuitPoint } from '../data/TrackData';
import { DIFFICULTIES, type DifficultyId, selectionState } from '../state/SelectionState';
import { UIHelpers, CYBER_THEME } from '../utils/UIHelpers';
import { SoundEffects } from '../utils/SoundEffects';

export class TrackSelectScene extends Phaser.Scene {
  private selectedTrack!: TrackConfig;
  private selectedDifficulty!: DifficultyId;

  // UI Containers & Elements
  private trackCardContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private difficultyButtons: Map<DifficultyId, Phaser.GameObjects.Container> = new Map();
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private previewCircuitGraphics!: Phaser.GameObjects.Graphics;
  private circuitBeacon!: Phaser.GameObjects.Arc;
  private circuitTween?: Phaser.Tweens.Tween;

  // Inspector labels
  private trackTitleText!: Phaser.GameObjects.Text;
  private trackTaglineText!: Phaser.GameObjects.Text;
  private trackDescText!: Phaser.GameObjects.Text;
  private trackStatsText!: Phaser.GameObjects.Text;
  private trackDifficultyBadge!: Phaser.GameObjects.Text;

  // Difficulty description labels
  private diffTaglineText!: Phaser.GameObjects.Text;
  private diffDescText!: Phaser.GameObjects.Text;
  private diffStatsText!: Phaser.GameObjects.Text;

  // Background atmosphere
  private speedStreaks: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super({ key: 'TrackSelectScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Load initial selection from state
    const state = selectionState.getState();
    this.selectedTrack = TRACKS.find((t) => t.id === state.selectedTrackId) || TRACKS[0];
    this.selectedDifficulty = state.selectedDifficulty;

    // 1. Background Atmosphere
    this.createAtmosphere(width, height);

    // 2. Navigation Header
    this.createHeader(width);

    // 3. Track Cards Grid (Left Column)
    this.createTrackGrid(60, 110);

    // 4. Featured Track Inspector (Right Column)
    this.createTrackInspector(640, 110);

    // 5. Difficulty Selection Panel (Right Column, Lower)
    this.createDifficultySelector(640, 440);

    // 6. Bottom Navigation Bar
    this.createFooter(width, height);

    // 7. Initial Inspector & Selection Render
    this.updateTrackInspector();
    this.updateDifficultyDisplay();
    this.highlightSelectedTrackCard();

    // Fade camera in
    this.cameras.main.fadeIn(300, 7, 10, 20);

    // ESC goes back
    this.input.keyboard?.on('keydown-ESC', () => {
      this.handleBack();
    });

    // ENTER proceeds to vehicle selection
    this.input.keyboard?.on('keydown-ENTER', () => {
      this.handleContinue();
    });
  }

  /**
   * Cyberpunk background with ambient glow and floating particles
   */
  private createAtmosphere(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(CYBER_THEME.BG_DARK, CYBER_THEME.BG_DARK, 0x0c1426, 0x070b16, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle neon grid lines
    bg.lineStyle(1, CYBER_THEME.CYAN, 0.04);
    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      bg.lineBetween(0, y, width, y);
    }

    // Ambient Glowing Orbs (Electric Cyan & Neon Purple)
    const purpleGlow = this.add.sprite(width * 0.1, height * 0.85, 'glow_orb')
      .setTint(CYBER_THEME.PURPLE)
      .setScale(3.2)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);

    const cyanGlow = this.add.sprite(width * 0.9, height * 0.15, 'glow_orb')
      .setTint(CYBER_THEME.CYAN)
      .setScale(3.2)
      .setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: [purpleGlow, cyanGlow],
      alpha: { from: 0.12, to: 0.25 },
      scale: { from: 2.8, to: 3.4 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Speed Streaks
    for (let i = 0; i < 16; i++) {
      const streak = this.add.sprite(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'speed_streak'
      )
        .setAngle(90)
        .setScale(Phaser.Math.FloatBetween(0.4, 0.8), Phaser.Math.FloatBetween(0.8, 1.5))
        .setAlpha(Phaser.Math.FloatBetween(0.1, 0.35))
        .setTint(i % 2 === 0 ? CYBER_THEME.CYAN : CYBER_THEME.PURPLE)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.speedStreaks.push(streak);
    }
  }

  /**
   * Top Header with Breadcrumbs & Back button
   */
  private createHeader(width: number): void {
    UIHelpers.createCyberHeader(
      this,
      width,
      'CIRCUIT SELECTION',
      'GLOBAL RACING CIRCUITS // TRACK SELECTION',
      () => this.handleBack()
    );
  }

  /**
   * 3x3 Grid of 9 Track Cards (Left Side)
   */
  private createTrackGrid(startX: number, startY: number): void {
    const cardW = 168;
    const cardH = 92;
    const gapX = 14;
    const gapY = 12;

    TRACKS.forEach((track, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = startX + col * (cardW + gapX) + cardW / 2;
      const y = startY + row * (cardH + gapY) + cardH / 2;

      const card = this.createTrackCard(track, x, y, cardW, cardH);
      this.trackCardContainers.set(track.id, card);
    });
  }

  /**
   * Creates an interactive cyber track thumbnail card
   */
  private createTrackCard(
    track: TrackConfig,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    container.add(bg);

    // Mini Circuit Thumbnail Graphics
    const thumbG = this.add.graphics();
    container.add(thumbG);
    this.drawMiniCircuit(thumbG, track, w, h);

    // Track Name Label
    const nameText = this.add.text(0, h / 2 - 22, track.name.toUpperCase(), {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '11px',
      color: '#ffffff',
      letterSpacing: 1,
    }).setOrigin(0.5);
    container.add(nameText);

    // Difficulty Recommended Pill Tag
    const diffColor = track.recommendedDifficulty === 'EASY'
      ? '#00ff9d'
      : track.recommendedDifficulty === 'MEDIUM' ? '#00f3ff' : '#ff0055';

    const diffBadge = this.add.text(0, h / 2 - 8, track.recommendedDifficulty, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '9px',
      color: diffColor,
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0.5);
    container.add(diffBadge);

    // Interactive Hitbox
    container.setSize(w, h);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    const renderCard = (isHovered: boolean, isSelected: boolean) => {
      bg.clear();
      const fillColor = isSelected ? 0x0f2444 : isHovered ? 0x0e1b33 : CYBER_THEME.BG_GLASS;
      const borderColor = isSelected ? CYBER_THEME.CYAN : isHovered ? CYBER_THEME.CYAN : 0x1e293b;
      const borderWidth = isSelected ? 2.5 : isHovered ? 1.5 : 1;

      bg.fillStyle(fillColor, 0.9);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(borderWidth, borderColor, isSelected ? 1 : isHovered ? 0.9 : 0.6);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

      if (isSelected) {
        // Glowing Neon Purple corner ticks
        bg.fillStyle(CYBER_THEME.PURPLE, 1);
        bg.fillRect(-w / 2, -h / 2, 8, 3);
        bg.fillRect(-w / 2, -h / 2, 3, 8);
        bg.fillRect(w / 2 - 8, h / 2 - 3, 8, 3);
        bg.fillRect(w / 2 - 3, h / 2 - 8, 3, 8);
      }
    };

    container.setData('render', renderCard);
    renderCard(false, track.id === this.selectedTrack.id);

    container.on('pointerover', () => {
      SoundEffects.playHover();
      renderCard(true, track.id === this.selectedTrack.id);
      this.tweens.add({
        targets: container,
        scaleX: 1.03,
        scaleY: 1.03,
        duration: 120,
        ease: 'Quad.easeOut',
      });
    });

    container.on('pointerout', () => {
      renderCard(false, track.id === this.selectedTrack.id);
      this.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 120,
        ease: 'Quad.easeOut',
      });
    });

    container.on('pointerdown', () => {
      SoundEffects.playClick();
      this.selectTrack(track);
    });

    return container;
  }

  /**
   * Draws a miniature procedural circuit layout on track cards
   */
  private drawMiniCircuit(g: Phaser.GameObjects.Graphics, track: TrackConfig, w: number, h: number): void {
    g.clear();
    const pts = track.circuitPoints;
    if (pts.length < 3) return;

    const mapX = (nx: number) => -w / 2 + nx * w;
    const mapY = (ny: number) => -h / 2 + 10 + ny * (h - 38);

    // Circuit track path outline
    g.lineStyle(3, 0x1e293b, 0.9);
    g.beginPath();
    g.moveTo(mapX(pts[0].x), mapY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(mapX(pts[i].x), mapY(pts[i].y));
    }
    g.closePath();
    g.strokePath();

    // Circuit neon accent line
    g.lineStyle(1.5, track.accentColor, 0.85);
    g.strokePath();

    // Start line indicator
    g.fillStyle(0xffffff, 1);
    g.fillCircle(mapX(pts[0].x), mapY(pts[0].y), 2.5);
  }

  /**
   * Creates the Large Featured Track Preview & Telemetry Panel (Right Side)
   */
  private createTrackInspector(x: number, y: number): void {
    const panelW = 580;
    const panelH = 300;

    const panelBg = this.add.graphics();
    UIHelpers.drawGlassPanel(panelBg, x, y, panelW, panelH, {
      borderColor: CYBER_THEME.CYAN,
      borderAlpha: 0.8,
      fillColor: CYBER_THEME.BG_NAVY,
      fillAlpha: 0.92,
      headerHeight: 46,
      headerColor: CYBER_THEME.PURPLE,
    });

    // Procedural Circuit Display Graphics Canvas
    this.previewGraphics = this.add.graphics();
    this.previewCircuitGraphics = this.add.graphics();

    // Animated beacon dot on the circuit
    this.circuitBeacon = this.add.circle(0, 0, 4, CYBER_THEME.CYAN);
    this.circuitBeacon.setBlendMode(Phaser.BlendModes.ADD);

    // Inspector Text Elements
    this.trackTitleText = this.add.text(x + 24, y + 14, '', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '20px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });

    this.trackTaglineText = this.add.text(x + 24, y + 56, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
      letterSpacing: 1,
    });

    this.trackDifficultyBadge = this.add.text(x + panelW - 24, y + 18, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(1, 0);

    this.trackDescText = this.add.text(x + 24, y + 215, '', {
      fontFamily: CYBER_THEME.FONT_BODY,
      fontSize: '13px',
      color: '#cbd5e1',
      wordWrap: { width: panelW - 48 },
      lineSpacing: 4,
    });

    this.trackStatsText = this.add.text(x + 24, y + 270, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#94a3b8',
      fontStyle: 'bold',
    });
  }

  /**
   * Redraws the featured track inspector with high-detail procedural graphics
   */
  private updateTrackInspector(): void {
    const track = this.selectedTrack;
    const boxX = 664;
    const boxY = 190;
    const boxW = 532;
    const boxH = 125;

    // 1. Text Details
    this.trackTitleText.setText(track.name.toUpperCase());
    this.trackTaglineText.setText(`// ${track.tagline} //`);
    this.trackDescText.setText(track.description);
    this.trackStatsText.setText(
      `LENGTH: ${track.length}  |  LAPS: ${track.laps}  |  SURFACE: ${track.surface.toUpperCase()}`
    );

    const diffColor = track.recommendedDifficulty === 'EASY'
      ? '#00ff9d'
      : track.recommendedDifficulty === 'MEDIUM' ? '#00f3ff' : '#ff0055';
    this.trackDifficultyBadge.setText(`RECOMMENDED: ${track.recommendedDifficulty}`);
    this.trackDifficultyBadge.setColor(diffColor);

    // 2. Procedural Terrain Backdrop
    this.previewGraphics.clear();
    this.drawTerrainBackdrop(this.previewGraphics, track, boxX, boxY, boxW, boxH);

    // 3. Procedural Detailed Circuit Path
    this.previewCircuitGraphics.clear();
    this.drawDetailedCircuit(this.previewCircuitGraphics, track, boxX, boxY, boxW, boxH);

    // 4. Animate Circuit Beacon
    this.startCircuitBeaconAnimation(track, boxX, boxY, boxW, boxH);
  }

  /**
   * Procedural thematic terrain elements for featured preview
   */
  private drawTerrainBackdrop(
    g: Phaser.GameObjects.Graphics,
    track: TrackConfig,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    // Backdrop frame
    g.fillStyle(0x060b18, 0.95);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, track.accentColor, 0.3);
    g.strokeRoundedRect(x, y, w, h, 6);

    switch (track.terrainType) {
      case 'coastal':
        // Ocean waves gradient & sandy curve
        g.fillStyle(0x0077b6, 0.3);
        g.fillRect(x, y + h * 0.5, w, h * 0.5);
        g.lineStyle(1.5, 0x00f0ff, 0.4);
        g.lineBetween(x, y + h * 0.5, x + w, y + h * 0.5);
        break;

      case 'city':
        // Skyscraper building blocks
        g.fillStyle(0x1e293b, 0.4);
        for (let i = 0; i < 9; i++) {
          const bx = x + 15 + i * 58;
          const bh = 25 + (i % 3) * 20;
          g.fillRect(bx, y + h - bh - 6, 40, bh);
        }
        break;

      case 'mountain':
        // Jagged mountain peaks
        g.fillStyle(0x334155, 0.4);
        g.beginPath();
        g.moveTo(x + 20, y + h - 10);
        g.lineTo(x + 120, y + 25);
        g.lineTo(x + 240, y + h - 10);
        g.lineTo(x + 360, y + 20);
        g.lineTo(x + 480, y + h - 10);
        g.closePath();
        g.fillPath();
        break;

      case 'desert':
        // Dunes strata
        g.fillStyle(0xd97706, 0.25);
        g.fillEllipse(x + w * 0.3, y + h * 0.8, w * 0.6, 60);
        g.fillEllipse(x + w * 0.8, y + h * 0.85, w * 0.5, 50);
        break;

      case 'forest':
        // Canopy clusters
        g.fillStyle(0x064e3b, 0.35);
        for (let i = 0; i < 7; i++) {
          g.fillCircle(x + 40 + i * 75, y + 30 + (i % 2) * 40, 24);
        }
        break;

      case 'snow':
        // Icy snow slopes
        g.fillStyle(0x1e40af, 0.3);
        g.fillRect(x, y + h * 0.4, w, h * 0.6);
        g.fillStyle(0xffffff, 0.15);
        g.fillEllipse(x + w * 0.5, y + h * 0.7, w * 0.7, 40);
        break;

      case 'volcano':
        // Molten lava pool
        g.fillStyle(0x7f1d1d, 0.5);
        g.fillRect(x, y + h * 0.3, w, h * 0.7);
        g.fillStyle(0xef4444, 0.4);
        g.fillCircle(x + w * 0.4, y + h * 0.6, 35);
        g.fillCircle(x + w * 0.75, y + h * 0.55, 28);
        break;

      case 'rural':
        // Farm pasture divisions
        g.fillStyle(0x3f6212, 0.3);
        g.fillRect(x, y + h * 0.5, w * 0.5, h * 0.5);
        g.fillStyle(0x854d0e, 0.25);
        g.fillRect(x + w * 0.5, y + h * 0.5, w * 0.5, h * 0.5);
        break;

      case 'space':
        // Orbit ring lines & stars
        g.lineStyle(1, 0xa855f7, 0.3);
        g.strokeEllipse(x + w * 0.5, y + h * 0.5, w * 0.85, h * 0.7);
        g.fillStyle(0xffffff, 0.6);
        for (let i = 0; i < 15; i++) {
          const sx = x + ((i * 37) % w);
          const sy = y + ((i * 29) % h);
          g.fillCircle(sx, sy, 1.5);
        }
        break;
    }
  }

  /**
   * Draws the prominent glowing circuit layout
   */
  private drawDetailedCircuit(
    g: Phaser.GameObjects.Graphics,
    track: TrackConfig,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const pts = track.circuitPoints;
    const mapX = (nx: number) => x + 25 + nx * (w - 50);
    const mapY = (ny: number) => y + 16 + ny * (h - 32);

    // 1. Wide Asphalt Base Layer
    g.lineStyle(18, 0x111625, 0.9);
    g.beginPath();
    g.moveTo(mapX(pts[0].x), mapY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(mapX(pts[i].x), mapY(pts[i].y));
    }
    g.closePath();
    g.strokePath();

    // 2. Road Surface
    g.lineStyle(12, 0x1e2638, 1);
    g.strokePath();

    // 3. Neon Circuit Border Glow
    g.lineStyle(2, track.accentColor, 0.95);
    g.strokePath();

    // 4. Checkered Start/Finish Gate
    const startX = mapX(pts[0].x);
    const startY = mapY(pts[0].y);
    g.fillStyle(0xffffff, 1);
    g.fillRect(startX - 5, startY - 7, 5, 7);
    g.fillRect(startX, startY, 5, 7);
    g.fillStyle(0x000000, 1);
    g.fillRect(startX, startY - 7, 5, 7);
    g.fillRect(startX - 5, startY, 5, 7);

    // Start text
    g.lineStyle(1, 0xffffff, 0.7);
    g.strokeRect(startX - 6, startY - 8, 12, 16);
  }

  /**
   * Animates a racing light beacon dot along the circuit path
   */
  private startCircuitBeaconAnimation(
    track: TrackConfig,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    if (this.circuitTween) {
      this.circuitTween.stop();
    }

    const pts = track.circuitPoints;
    const mapX = (nx: number) => x + 25 + nx * (w - 50);
    const mapY = (ny: number) => y + 16 + ny * (h - 32);

    this.circuitBeacon.setFillStyle(track.accentColor, 1);

    // Build path points
    const fullPoints: CircuitPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      fullPoints.push({ x: mapX(pts[i].x), y: mapY(pts[i].y) });
    }
    fullPoints.push(fullPoints[0]); // close loop

    let progressObj = { t: 0 };
    this.circuitTween = this.tweens.add({
      targets: progressObj,
      t: fullPoints.length - 1,
      duration: 3800,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        const seg = Math.floor(progressObj.t);
        const subT = progressObj.t - seg;
        const p1 = fullPoints[seg % fullPoints.length];
        const p2 = fullPoints[(seg + 1) % fullPoints.length];
        if (p1 && p2) {
          this.circuitBeacon.x = p1.x + (p2.x - p1.x) * subT;
          this.circuitBeacon.y = p1.y + (p2.y - p1.y) * subT;
        }
      },
    });
  }

  /**
   * Difficulty Selection Panel (EASY, MEDIUM, HARD)
   */
  private createDifficultySelector(x: number, y: number): void {
    const panelW = 580;
    const panelH = 185;

    // Background Frame
    const panelBg = this.add.graphics();
    UIHelpers.drawGlassPanel(panelBg, x, y, panelW, panelH, {
      borderColor: 0x1e293b,
      borderAlpha: 0.8,
      fillColor: CYBER_THEME.BG_NAVY,
      fillAlpha: 0.92,
      headerHeight: 40,
      headerColor: CYBER_THEME.CYAN,
    });

    this.add.text(x + 24, y + 14, 'RACE DIFFICULTY MODIFIER', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '14px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });

    // Difficulty Option Buttons
    const diffKeys: DifficultyId[] = ['EASY', 'MEDIUM', 'HARD'];
    const btnW = 160;
    const btnH = 38;
    const gap = 16;
    const btnStartX = x + 24 + btnW / 2;

    diffKeys.forEach((diffId, idx) => {
      const btnX = btnStartX + idx * (btnW + gap);
      const btnY = y + 56;

      const btn = this.createDifficultyButton(diffId, btnX, btnY, btnW, btnH);
      this.difficultyButtons.set(diffId, btn);
    });

    // Dynamic Difficulty Info Box
    const infoBg = this.add.graphics();
    infoBg.fillStyle(0x060b18, 0.85);
    infoBg.fillRoundedRect(x + 24, y + 86, panelW - 48, 84, 6);
    infoBg.lineStyle(1, 0x1e293b, 0.7);
    infoBg.strokeRoundedRect(x + 24, y + 86, panelW - 48, 84, 6);

    this.diffTaglineText = this.add.text(x + 36, y + 96, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
      letterSpacing: 1,
    });

    this.diffDescText = this.add.text(x + 36, y + 115, '', {
      fontFamily: CYBER_THEME.FONT_BODY,
      fontSize: '12.5px',
      color: '#cbd5e1',
      wordWrap: { width: panelW - 72 },
      lineSpacing: 2,
    });

    this.diffStatsText = this.add.text(x + 36, y + 148, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#94a3b8',
      fontStyle: 'bold',
    });
  }

  /**
   * Interactive difficulty toggle button
   */
  private createDifficultyButton(
    diffId: DifficultyId,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    container.add(bg);

    const diff = DIFFICULTIES[diffId];
    const text = this.add.text(0, 0, diff.id, {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '13px',
      color: '#ffffff',
      letterSpacing: 1.5,
    }).setOrigin(0.5);
    container.add(text);

    container.setSize(w, h);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    const render = (isHovered: boolean, isSelected: boolean) => {
      bg.clear();
      const accent = diffId === 'EASY'
        ? CYBER_THEME.EMERALD
        : diffId === 'MEDIUM' ? CYBER_THEME.CYAN : CYBER_THEME.PURPLE;
      const fillColor = isSelected ? 0x0f2444 : isHovered ? 0x0e1b33 : CYBER_THEME.BG_GLASS;
      const fillAlpha = isSelected ? 0.95 : 0.8;
      const borderColor = isSelected ? accent : isHovered ? CYBER_THEME.CYAN : 0x1e293b;
      const borderWidth = isSelected ? 2.5 : isHovered ? 1.5 : 1;

      bg.fillStyle(fillColor, fillAlpha);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(borderWidth, borderColor, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

      if (isSelected) {
        bg.fillStyle(accent, 1);
        bg.fillRect(-w / 2, -h / 2, 6, 2);
        bg.fillRect(-w / 2, -h / 2, 2, 6);
        bg.fillRect(w / 2 - 6, h / 2 - 2, 6, 2);
        bg.fillRect(w / 2 - 2, h / 2 - 6, 2, 6);
      }

      text.setColor(isSelected ? '#ffffff' : isHovered ? '#00f0ff' : '#94a3b8');
    };

    container.setData('render', render);
    render(false, diffId === this.selectedDifficulty);

    container.on('pointerover', () => {
      SoundEffects.playHover();
      render(true, diffId === this.selectedDifficulty);
      this.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 100 });
    });

    container.on('pointerout', () => {
      render(false, diffId === this.selectedDifficulty);
      this.tweens.add({ targets: container, scaleX: 1.0, scaleY: 1.0, duration: 100 });
    });

    container.on('pointerdown', () => {
      SoundEffects.playClick();
      this.selectDifficulty(diffId);
    });

    return container;
  }

  /**
   * Updates Difficulty text and highlights
   */
  private updateDifficultyDisplay(): void {
    const diff = DIFFICULTIES[this.selectedDifficulty];
    this.diffTaglineText.setText(`// ${diff.name} — ${diff.tagline} //`);
    this.diffDescText.setText(diff.description);
    this.diffStatsText.setText(`AI BEHAVIOR: ${diff.aiAggression}   |   NITRO TUNING: ${diff.nitroBonus}`);

    this.difficultyButtons.forEach((btn, id) => {
      const render = btn.getData('render');
      if (render) render(false, id === this.selectedDifficulty);
    });
  }

  /**
   * Selects a track and persists in state
   */
  private selectTrack(track: TrackConfig): void {
    this.selectedTrack = track;
    selectionState.setTrack(track.id);

    this.highlightSelectedTrackCard();
    this.updateTrackInspector();
  }

  /**
   * Selects a difficulty and persists in state
   */
  private selectDifficulty(diffId: DifficultyId): void {
    this.selectedDifficulty = diffId;
    selectionState.setDifficulty(diffId);
    this.updateDifficultyDisplay();
  }

  /**
   * Highlights the selected track card and resets others
   */
  private highlightSelectedTrackCard(): void {
    this.trackCardContainers.forEach((card, id) => {
      const render = card.getData('render');
      if (render) render(false, id === this.selectedTrack.id);
    });
  }

  /**
   * Bottom Navigation Footer
   */
  private createFooter(width: number, height: number): void {
    const footerY = height - 42;

    // Continue to Garage Button (Primary Electric Cyan)
    UIHelpers.createCyberButton({
      scene: this,
      x: width - 170,
      y: footerY,
      width: 250,
      height: 48,
      label: 'SELECT VEHICLE ►',
      variant: 'primary',
      onClick: () => this.handleContinue(),
    });
  }

  /**
   * Navigate back to Main Menu
   */
  private handleBack(): void {
    SoundEffects.playClick();
    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MainMenuScene');
    });
  }

  /**
   * Proceed to GarageScene with current configuration
   */
  private handleContinue(): void {
    SoundEffects.playClick();
    selectionState.setReturnScene('TrackSelectScene');

    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GarageScene', {
        fromTrackSelect: true,
        trackId: this.selectedTrack.id,
        difficulty: this.selectedDifficulty,
      });
    });
  }

  update(_time: number, delta: number): void {
    const { height } = this.scale;
    const dt = delta / 1000;

    // Animate background speed streaks
    for (let i = 0; i < this.speedStreaks.length; i++) {
      const streak = this.speedStreaks[i];
      streak.y += 450 * dt;
      if (streak.y > height + 80) {
        streak.y = -80;
      }
    }
  }
}
