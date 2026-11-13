import Phaser from 'phaser';
import { CARS, type CarConfig } from '../data/CarData';
import { TRACKS } from '../data/TrackData';
import { selectionState, type SelectionStateData } from '../state/SelectionState';
import { UIHelpers, CYBER_THEME } from '../utils/UIHelpers';
import { SoundEffects } from '../utils/SoundEffects';

export class GarageScene extends Phaser.Scene {
  private selectedCar!: CarConfig;
  private stateData!: SelectionStateData;
  private isFromTrackSelect: boolean = false;

  // Turntable display elements
  private turntableContainer!: Phaser.GameObjects.Container;
  private turntableRing!: Phaser.GameObjects.Graphics;
  private carSprite!: Phaser.GameObjects.Sprite;
  private underglowSprite!: Phaser.GameObjects.Sprite;
  private exhaustLeft?: Phaser.GameObjects.Particles.ParticleEmitter;
  private exhaustRight?: Phaser.GameObjects.Particles.ParticleEmitter;
  private turntableAngle: number = 0;

  // Car specification telemetry labels
  private carTitleText!: Phaser.GameObjects.Text;
  private carClassText!: Phaser.GameObjects.Text;
  private carDescText!: Phaser.GameObjects.Text;
  private engineText!: Phaser.GameObjects.Text;
  private drivetrainText!: Phaser.GameObjects.Text;
  private weightText!: Phaser.GameObjects.Text;

  // Interactive Car Cards & Stat Bars
  private carCardContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private statBarsContainer!: Phaser.GameObjects.Container;

  // Background speed streaks
  private speedStreaks: Phaser.GameObjects.Sprite[] = [];

  // Modal Dialog
  private modalContainer: Phaser.GameObjects.Container | null = null;
  private isModalOpen: boolean = false;

  constructor() {
    super({ key: 'GarageScene' });
  }

  init(data: { fromTrackSelect?: boolean; trackId?: string; difficulty?: string }): void {
    this.isFromTrackSelect = !!data?.fromTrackSelect;
    if (this.isFromTrackSelect) {
      selectionState.setReturnScene('TrackSelectScene');
    }
  }

  create(): void {
    const { width, height } = this.scale;

    // Load initial selection state
    this.stateData = selectionState.getState();
    this.selectedCar = CARS.find((c) => c.id === this.stateData.selectedCarId) || CARS[0];

    // 1. Atmosphere
    this.createAtmosphere(width, height);

    // 2. Navigation Header
    this.createHeader(width);

    // 3. Car Showcase Turntable (Left Column)
    this.createCarShowcase(350, 360);

    // 4. Car Selector Tabs (Right Column, Top)
    this.createCarSelectorTabs(700, 110);

    // 5. Performance Stats Panel (Right Column, Bottom)
    this.createPerformancePanel(700, 385);

    // 6. Footer Navigation
    this.createFooter(width, height);

    // 7. Initial Render & Highlights
    this.updateCarDisplay();
    this.highlightSelectedCarCard();

    // Fade camera in
    this.cameras.main.fadeIn(300, 7, 10, 20);

    // Keyboard support
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.isModalOpen) {
        this.closeModal();
      } else {
        this.handleBack();
      }
    });

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.isModalOpen) {
        this.closeModal();
        this.launchRaceScene();
      } else {
        this.handleContinue();
      }
    });
  }

  /**
   * Cyberpunk garage background with ambient lighting
   */
  private createAtmosphere(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(CYBER_THEME.BG_DARK, CYBER_THEME.BG_DARK, 0x0c1426, 0x070b16, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle cyber grid lines
    bg.lineStyle(1, CYBER_THEME.CYAN, 0.04);
    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      bg.lineBetween(0, y, width, y);
    }

    // Ambient Glowing Orbs (Electric Cyan & Neon Purple)
    const ambientLeft = this.add.sprite(width * 0.25, height * 0.5, 'glow_orb')
      .setTint(CYBER_THEME.PURPLE)
      .setScale(3.6)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);

    const ambientRight = this.add.sprite(width * 0.85, height * 0.3, 'glow_orb')
      .setTint(CYBER_THEME.CYAN)
      .setScale(3.5)
      .setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: [ambientLeft, ambientRight],
      alpha: { from: 0.14, to: 0.28 },
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Speed Streaks
    for (let i = 0; i < 18; i++) {
      const streak = this.add.sprite(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'speed_streak'
      )
        .setAngle(90)
        .setScale(Phaser.Math.FloatBetween(0.4, 0.8), Phaser.Math.FloatBetween(0.8, 1.4))
        .setAlpha(Phaser.Math.FloatBetween(0.08, 0.25))
        .setTint(i % 2 === 0 ? CYBER_THEME.CYAN : CYBER_THEME.PURPLE)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.speedStreaks.push(streak);
    }
  }

  /**
   * Header Navigation Bar
   */
  private createHeader(width: number): void {
    UIHelpers.createCyberHeader(
      this,
      width,
      'VEHICLE GARAGE',
      'TUNER BAY // CHASSIS SELECTION',
      () => this.handleBack()
    );

    // Selected Circuit Context Pill
    if (this.isFromTrackSelect) {
      const selectedTrack = TRACKS.find((t) => t.id === this.stateData.selectedTrackId) || TRACKS[0];
      const badge = this.add.graphics().setDepth(55);
      badge.fillStyle(CYBER_THEME.CYAN, 0.12);
      badge.lineStyle(1, CYBER_THEME.CYAN, 0.6);
      badge.strokeRoundedRect(width - 290, 20, 250, 32, 4);
      badge.fillRoundedRect(width - 290, 20, 250, 32, 4);

      this.add.text(
        width - 165,
        36,
        `CIRCUIT: ${selectedTrack.name.toUpperCase()} [${this.stateData.selectedDifficulty}]`,
        {
          fontFamily: CYBER_THEME.FONT_MONO,
          fontSize: '10px',
          color: '#00f0ff',
          fontStyle: 'bold',
        }
      ).setOrigin(0.5).setDepth(56);
    }
  }

  /**
   * Rotating 3D-Perspective Turntable Showcasing the Car
   */
  private createCarShowcase(centerX: number, centerY: number): void {
    this.turntableContainer = this.add.container(centerX, centerY);

    // Turntable Geometry
    this.turntableRing = this.add.graphics();
    this.turntableContainer.add(this.turntableRing);

    // Dynamic Floor Underglow
    this.underglowSprite = this.add.sprite(0, 0, 'glow_orb')
      .setScale(2.5, 1.2)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.turntableContainer.add(this.underglowSprite);

    // Shadow
    const carShadow = this.add.ellipse(0, 8, 100, 150, 0x000000, 0.65);
    this.turntableContainer.add(carShadow);

    // Car Sprite
    this.carSprite = this.add.sprite(0, 0, this.selectedCar.textureKey);
    this.turntableContainer.add(this.carSprite);

    // Idle Engine Hover Tween
    this.tweens.add({
      targets: this.carSprite,
      y: { from: -4, to: 4 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Telemetry Specs Box below turntable
    const specBox = this.add.graphics();
    UIHelpers.drawGlassPanel(specBox, centerX - 240, centerY + 140, 480, 88, {
      borderColor: 0x1e293b,
      borderAlpha: 0.8,
      fillColor: CYBER_THEME.BG_NAVY,
      fillAlpha: 0.9,
    });

    this.carTitleText = this.add.text(centerX - 220, centerY + 155, '', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '17px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });

    this.carClassText = this.add.text(centerX + 220, centerY + 158, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.engineText = this.add.text(centerX - 220, centerY + 185, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#94a3b8',
    });

    this.drivetrainText = this.add.text(centerX - 220, centerY + 203, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#94a3b8',
    });

    this.weightText = this.add.text(centerX + 220, centerY + 195, '', {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#cbd5e1',
      fontStyle: 'bold',
    }).setOrigin(1, 0);
  }

  /**
   * 4 Car Selection Tabs (Right Column, Top)
   */
  private createCarSelectorTabs(startX: number, startY: number): void {
    const cardW = 510;
    const cardH = 58;
    const gapY = 10;

    CARS.forEach((car, index) => {
      const x = startX + cardW / 2;
      const y = startY + index * (cardH + gapY) + cardH / 2;

      const card = this.createCarTabCard(car, x, y, cardW, cardH);
      this.carCardContainers.set(car.id, card);
    });
  }

  /**
   * Creates an interactive car selector card
   */
  private createCarTabCard(
    car: CarConfig,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    container.add(bg);

    // Mini Car Preview Icon
    const miniCar = this.add.sprite(-w / 2 + 40, 0, car.textureKey)
      .setScale(0.35)
      .setAngle(90);
    container.add(miniCar);

    // Car Name
    const nameText = this.add.text(-w / 2 + 85, -12, car.name.toUpperCase(), {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '15px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });
    container.add(nameText);

    // Class & Tagline
    const classText = this.add.text(-w / 2 + 85, 10, `${car.class} // ${car.tagline}`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '10px',
      color: '#94a3b8',
    });
    container.add(classText);

    // Top Speed Tag on Right
    const speedTag = this.add.text(w / 2 - 20, 0, `SPEED: ${car.stats.topSpeed}`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5);
    container.add(speedTag);

    // Interactive Hit Area
    container.setSize(w, h);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    const render = (isHovered: boolean, isSelected: boolean) => {
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

    container.setData('render', render);
    render(false, car.id === this.selectedCar.id);

    container.on('pointerover', () => {
      SoundEffects.playHover();
      render(true, car.id === this.selectedCar.id);
      this.tweens.add({ targets: container, scaleX: 1.02, scaleY: 1.02, duration: 100 });
    });

    container.on('pointerout', () => {
      render(false, car.id === this.selectedCar.id);
      this.tweens.add({ targets: container, scaleX: 1.0, scaleY: 1.0, duration: 100 });
    });

    container.on('pointerdown', () => {
      SoundEffects.playClick();
      this.selectCar(car);
    });

    return container;
  }

  /**
   * Performance Telemetry Panel (Animated Stat Bars & Lore)
   */
  private createPerformancePanel(x: number, y: number): void {
    const panelW = 510;
    const panelH = 230;

    const panelBg = this.add.graphics();
    UIHelpers.drawGlassPanel(panelBg, x, y, panelW, panelH, {
      borderColor: 0x1e293b,
      borderAlpha: 0.8,
      fillColor: CYBER_THEME.BG_NAVY,
      fillAlpha: 0.9,
      headerHeight: 38,
      headerColor: CYBER_THEME.CYAN,
    });

    this.add.text(x + 20, y + 14, 'TELEMETRY PROFILE & DYNAMICS', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '14px',
      color: '#ffffff',
      letterSpacing: 1.5,
    });

    // Description text
    this.carDescText = this.add.text(x + 20, y + 48, '', {
      fontFamily: CYBER_THEME.FONT_BODY,
      fontSize: '13px',
      color: '#94a3b8',
      wordWrap: { width: panelW - 40 },
      lineSpacing: 2,
    });

    // Stat Bars Container (Dynamic recreation on car switch)
    this.statBarsContainer = this.add.container(x + 20, y + 96);
  }

  /**
   * Updates all UI elements with the newly selected car
   */
  private updateCarDisplay(): void {
    const car = this.selectedCar;

    // 1. Update Turntable Car & Lighting
    this.carSprite.setTexture(car.textureKey);
    this.underglowSprite.setTint(car.glowColor);

    // Recreate Exhaust Particle Emitters
    if (this.exhaustLeft) this.exhaustLeft.destroy();
    if (this.exhaustRight) this.exhaustRight.destroy();

    const particleTexture = car.id === 'viper-r'
      ? 'particle_green'
      : car.id === 'rally-apex' ? 'particle_blue' : 'particle_cyan';

    this.exhaustLeft = this.add.particles(this.carSprite.x - 13, this.carSprite.y + 64, particleTexture, {
      speedY: { min: 40, max: 120 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      frequency: 45,
      blendMode: 'ADD',
    });
    this.exhaustRight = this.add.particles(this.carSprite.x + 13, this.carSprite.y + 64, particleTexture, {
      speedY: { min: 40, max: 120 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      frequency: 45,
      blendMode: 'ADD',
    });
    this.turntableContainer.add([this.exhaustLeft, this.exhaustRight]);

    // 2. Update Spec Labels
    this.carTitleText.setText(car.name.toUpperCase());
    this.carClassText.setText(car.class);
    this.engineText.setText(`ENGINE: ${car.engine}`);
    this.drivetrainText.setText(`DRIVETRAIN: ${car.drivetrain}`);
    this.weightText.setText(`WEIGHT: ${car.weight}`);
    this.carDescText.setText(car.description);

    // 3. Rebuild Stat Bars (Electric Cyan, Neon Purple, Neon Emerald)
    this.statBarsContainer.removeAll(true);
    const barWidth = 470;
    const statSpacing = 32;

    const stats = [
      { label: 'TOP SPEED', value: car.stats.topSpeed, color: CYBER_THEME.CYAN },
      { label: 'ACCELERATION', value: car.stats.acceleration, color: CYBER_THEME.PURPLE },
      { label: 'HANDLING / GRIP', value: car.stats.handling, color: CYBER_THEME.EMERALD },
      { label: 'NITRO CAPACITY', value: car.stats.nitro, color: CYBER_THEME.CYAN },
    ];

    stats.forEach((stat, idx) => {
      const bar = UIHelpers.createStatBar(
        this,
        0,
        idx * statSpacing,
        barWidth,
        stat.label,
        stat.value,
        stat.color
      );
      this.statBarsContainer.add(bar);
    });
  }

  /**
   * Sets selected car, updates state and refreshes view
   */
  private selectCar(car: CarConfig): void {
    this.selectedCar = car;
    selectionState.setCar(car.id);

    this.highlightSelectedCarCard();
    this.updateCarDisplay();
  }

  /**
   * Highlights selected car card
   */
  private highlightSelectedCarCard(): void {
    this.carCardContainers.forEach((card, id) => {
      const render = card.getData('render');
      if (render) render(false, id === this.selectedCar.id);
    });
  }

  /**
   * Bottom Navigation Footer
   */
  private createFooter(width: number, height: number): void {
    const footerY = height - 42;

    const continueLabel = this.isFromTrackSelect ? 'CONFIRM SETUP & RACE ►' : 'SELECT CIRCUIT ►';
    UIHelpers.createCyberButton({
      scene: this,
      x: width - 180,
      y: footerY,
      width: 270,
      height: 48,
      label: continueLabel,
      variant: 'primary',
      onClick: () => this.handleContinue(),
    });
  }

  /**
   * Navigate back to previous scene
   */
  private handleBack(): void {
    SoundEffects.playClick();
    const returnScene = this.isFromTrackSelect ? 'TrackSelectScene' : 'MainMenuScene';

    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(returnScene);
    });
  }

  /**
   * Proceed forward or confirm setup
   */
  private handleContinue(): void {
    SoundEffects.playClick();

    if (this.isFromTrackSelect) {
      // Race setup complete! Show race confirmation summary modal
      this.showRaceConfirmationModal();
    } else {
      // Direct garage flow -> Proceed to track selection
      this.cameras.main.fadeOut(250, 7, 10, 20);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('TrackSelectScene');
      });
    }
  }

  /**
   * Shows Race Configuration summary modal confirming selections
   */
  private showRaceConfirmationModal(): void {
    SoundEffects.playModalOpen();
    this.isModalOpen = true;

    const { width, height } = this.scale;
    this.modalContainer = this.add.container(width / 2, height / 2).setDepth(100);

    // Backdrop Dimmer
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.85);
    backdrop.fillRect(-width / 2, -height / 2, width, height);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    this.modalContainer.add(backdrop);

    // Modal Frame
    const modalW = 560;
    const modalH = 340;
    const frame = this.add.graphics();
    frame.fillStyle(CYBER_THEME.BG_NAVY, 0.98);
    frame.fillRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 10);
    frame.lineStyle(2, CYBER_THEME.CYAN, 0.95);
    frame.strokeRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 10);

    // Header bar
    frame.fillStyle(CYBER_THEME.PURPLE, 0.25);
    frame.fillRoundedRect(-modalW / 2 + 2, -modalH / 2 + 2, modalW - 4, 46, { tl: 10, tr: 10, bl: 0, br: 0 });
    this.modalContainer.add(frame);

    const title = this.add.text(0, -modalH / 2 + 23, 'RACE CONFIGURATION LOCKED', {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '18px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.modalContainer.add(title);

    const track = TRACKS.find((t) => t.id === this.stateData.selectedTrackId) || TRACKS[0];
    const lines = [
      `CIRCUIT: ${track.name.toUpperCase()} (${track.environment})`,
      `MACHINE: ${this.selectedCar.name} [${this.selectedCar.class}]`,
      `DIFFICULTY: ${this.stateData.selectedDifficulty}`,
      `ENGINE SETUP: ${this.selectedCar.engine}`,
      'CIRCUIT STATUS: Grid clear // Starting lights ready // Launch sequence prepared.',
    ];

    lines.forEach((line, index) => {
      const lineText = this.add.text(0, -modalH / 2 + 75 + index * 30, line, {
        fontFamily: index === lines.length - 1 ? CYBER_THEME.FONT_MONO : CYBER_THEME.FONT_BODY,
        fontSize: index === lines.length - 1 ? '11px' : '14px',
        color: index === lines.length - 1 ? '#00f0ff' : '#e2e8f0',
        align: 'center',
        fontStyle: index < 3 ? 'bold' : 'normal',
      }).setOrigin(0.5);
      this.modalContainer?.add(lineText);
    });

    // Start Race Primary Button (Electric Cyan)
    const startRaceBtn = UIHelpers.createCyberButton({
      scene: this,
      x: modalW / 4 - 15,
      y: modalH / 2 - 38,
      width: 230,
      height: 44,
      label: 'START RACE ►',
      variant: 'primary',
      onClick: () => {
        this.closeModal();
        this.launchRaceScene();
      },
    });
    this.modalContainer.add(startRaceBtn);

    // Modify Setup Secondary Button
    const returnBtn = UIHelpers.createCyberButton({
      scene: this,
      x: -modalW / 4 + 15,
      y: modalH / 2 - 38,
      width: 210,
      height: 44,
      label: 'MODIFY SETUP',
      icon: '✕',
      variant: 'secondary',
      onClick: () => this.closeModal(),
    });
    this.modalContainer.add(returnBtn);

    // Scale Entrance
    this.modalContainer.setScale(0.85);
    this.modalContainer.setAlpha(0);
    this.tweens.add({
      targets: this.modalContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Launches RaceScene with selected configuration
   */
  public launchRaceScene(): void {
    SoundEffects.playNitroLaunch();
    this.cameras.main.flash(200, 0, 243, 255);
    this.cameras.main.fadeOut(300, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('RaceScene');
    });
  }

  /**
   * Closes the active confirmation modal
   */
  private closeModal(): void {
    if (!this.modalContainer || !this.isModalOpen) return;
    SoundEffects.playModalClose();
    this.isModalOpen = false;

    this.tweens.add({
      targets: this.modalContainer,
      scaleX: 0.9,
      scaleY: 0.9,
      alpha: 0,
      duration: 120,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.modalContainer?.destroy();
        this.modalContainer = null;
      },
    });
  }

  update(_time: number, delta: number): void {
    const { height } = this.scale;
    const dt = delta / 1000;

    // Animate Turntable Perimeter Ring (Concentric Purple & Cyan)
    if (this.turntableRing) {
      this.turntableAngle = (this.turntableAngle + dt * 1.5) % (Math.PI * 2);
      this.turntableRing.clear();

      // Outer ellipse (Neon Purple)
      this.turntableRing.lineStyle(2, CYBER_THEME.PURPLE, 0.7);
      this.turntableRing.strokeEllipse(0, 0, 240, 110);

      // Inner ellipse (Electric Cyan)
      this.turntableRing.lineStyle(1, CYBER_THEME.CYAN, 0.5);
      this.turntableRing.strokeEllipse(0, 0, 180, 80);

      // Rotating tick marks
      const tickCount = 12;
      for (let t = 0; t < tickCount; t++) {
        const angle = (t / tickCount) * Math.PI * 2 + this.turntableAngle;
        const tx = Math.cos(angle) * 120;
        const ty = Math.sin(angle) * 55;
        this.turntableRing.fillStyle(t % 2 === 0 ? CYBER_THEME.PURPLE : CYBER_THEME.CYAN, 0.85);
        this.turntableRing.fillCircle(tx, ty, 2.5);
      }
    }

    // Animate Background Speed Streaks
    for (let i = 0; i < this.speedStreaks.length; i++) {
      const streak = this.speedStreaks[i];
      streak.y += 450 * dt;
      if (streak.y > height + 80) {
        streak.y = -80;
      }
    }
  }
}
