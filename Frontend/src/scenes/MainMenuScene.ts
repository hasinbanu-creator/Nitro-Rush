import Phaser from 'phaser';
import { SoundEffects } from '../utils/SoundEffects';
import { settingsManager } from '../utils/SettingsManager';

interface SpeedStreak {
  sprite: Phaser.GameObjects.Sprite;
  speed: number;
}

interface EmberParticle {
  sprite: Phaser.GameObjects.Sprite;
  speedY: number;
  wobbleSpeed: number;
  wobbleDist: number;
  startX: number;
}

export class MainMenuScene extends Phaser.Scene {
  private speedStreaks: SpeedStreak[] = [];
  private emberParticles: EmberParticle[] = [];
  private backgroundGrid!: Phaser.GameObjects.Graphics;
  private gridOffsetY: number = 0;
  private gridScrollY: number = 0;
  private pedestalRing!: Phaser.GameObjects.Graphics;
  private heroCarContainer!: Phaser.GameObjects.Container;
  private modalContainer: Phaser.GameObjects.Container | null = null;
  private isModalOpen: boolean = false;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Enable audio context on first pointer down
    this.input.once('pointerdown', () => {
      SoundEffects.unlock();
    });

    // 1. Background Layers
    this.createCyberBackground(width, height);

    // 2. Dynamic Speed Grid and Particles
    this.createSpeedAtmosphere(width, height);

    // 3. Hero Car Turntable Display (Right Column)
    this.createHeroCarDisplay(width * 0.72, height * 0.52);

    // 4. Game Title & Subtitle Branding (Left Column)
    this.createBranding(width * 0.28, height * 0.24);

    // 5. Interactive Menu Buttons (Left Column)
    this.createMenuButtons(width * 0.28, height * 0.49);

    // 6. Footer Controls & Status Information
    this.createFooter(width, height);

    // 7. Keyboard support (ESC closes any open modal)
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.isModalOpen) {
        this.closeModal();
      }
    });

    // Fade camera in from black
    this.cameras.main.fadeIn(400, 7, 10, 20);
  }

  /**
   * Deep cyberpunk gradient background with ambient glowing lights
   */
  private createCyberBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x060811, 0x060811, 0x0c1122, 0x090c1a, 1);
    bg.fillRect(0, 0, width, height);

    // Dynamic animated grid graphics layer
    this.backgroundGrid = this.add.graphics();

    // Ambient Glowing Orbs
    const orangeGlow = this.add.sprite(width * 0.15, height * 0.85, 'glow_orb')
      .setScale(3.5)
      .setAlpha(0.25)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: orangeGlow,
      alpha: { from: 0.18, to: 0.32 },
      scale: { from: 3.2, to: 3.8 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const blueGlow = this.add.sprite(width * 0.8, height * 0.2, 'glow_orb')
      .setTint(0x00f0ff)
      .setScale(3)
      .setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: blueGlow,
      alpha: { from: 0.12, to: 0.24 },
      scale: { from: 2.8, to: 3.4 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * High-speed vertical streaks and floating cyber embers
   */
  private createSpeedAtmosphere(width: number, height: number): void {
    // 1. High velocity vertical speed lines
    const streakCount = 28;
    for (let i = 0; i < streakCount; i++) {
      const x = Phaser.Math.Between(10, width - 10);
      const y = Phaser.Math.Between(0, height);
      const speed = Phaser.Math.Between(450, 950);
      const scaleX = Phaser.Math.FloatBetween(0.4, 1.2);
      const scaleY = Phaser.Math.FloatBetween(0.8, 2.0);
      const alpha = Phaser.Math.FloatBetween(0.15, 0.55);

      const streak = this.add.sprite(x, y, 'speed_streak')
        .setAngle(90) // Vertical downward streak
        .setScale(scaleX, scaleY)
        .setAlpha(alpha)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.speedStreaks.push({ sprite: streak, speed });
    }

    // 2. Floating glowing embers rising slowly from the bottom
    const emberCount = 22;
    for (let i = 0; i < emberCount; i++) {
      const x = Phaser.Math.Between(20, width - 20);
      const y = Phaser.Math.Between(0, height);
      const speedY = Phaser.Math.FloatBetween(25, 75);
      const wobbleSpeed = Phaser.Math.FloatBetween(1.5, 3.5);
      const wobbleDist = Phaser.Math.FloatBetween(15, 45);

      const ember = this.add.sprite(x, y, 'particle_ember')
        .setScale(Phaser.Math.FloatBetween(0.6, 1.3))
        .setAlpha(Phaser.Math.FloatBetween(0.3, 0.8))
        .setBlendMode(Phaser.BlendModes.ADD);

      this.emberParticles.push({
        sprite: ember,
        speedY,
        wobbleSpeed,
        wobbleDist,
        startX: x,
      });
    }
  }

  /**
   * Rotating high-tech pedestal showcasing the procedural hero car
   */
  private createHeroCarDisplay(centerX: number, centerY: number): void {
    this.heroCarContainer = this.add.container(centerX, centerY);

    // Glowing circular pedestal
    this.pedestalRing = this.add.graphics();
    this.heroCarContainer.add(this.pedestalRing);

    // Neon floor underglow
    const underglow = this.add.sprite(0, 0, 'glow_orb')
      .setScale(2.2, 1.1)
      .setTint(0xff5500)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.heroCarContainer.add(underglow);

    // Car Shadow
    const carShadow = this.add.ellipse(0, 8, 90, 140, 0x000000, 0.65);
    this.heroCarContainer.add(carShadow);

    // Hero Car Sprite
    const carSprite = this.add.sprite(0, 0, 'hero_car');
    this.heroCarContainer.add(carSprite);

    // Tailpipe exhaust flame particles
    const exhaustEmitterLeft = this.add.particles(carSprite.x - 13, carSprite.y + 64, 'particle_orange', {
      speedY: { min: 40, max: 120 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      frequency: 45,
      blendMode: 'ADD',
    });
    const exhaustEmitterRight = this.add.particles(carSprite.x + 13, carSprite.y + 64, 'particle_orange', {
      speedY: { min: 40, max: 120 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      frequency: 45,
      blendMode: 'ADD',
    });
    this.heroCarContainer.add([exhaustEmitterLeft, exhaustEmitterRight]);

    // Subtle engine idle bobbing tween
    this.tweens.add({
      targets: carSprite,
      y: { from: -4, to: 4 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Holographic Telemetry HUD Cards around the car
    const telemetryBox = this.add.graphics();
    telemetryBox.lineStyle(1, 0x00f0ff, 0.4);
    telemetryBox.fillStyle(0x0a101f, 0.7);
    telemetryBox.strokeRoundedRect(centerX - 130, centerY + 115, 260, 68, 6);
    telemetryBox.fillRoundedRect(centerX - 130, centerY + 115, 260, 68, 6);

    const vehicleTag = this.add.text(centerX, centerY + 130, 'VEHICLE // APEX-GT [CLASS S]', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#00f0ff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const statsTag = this.add.text(centerX, centerY + 155, 'TOP SPEED: 340 KM/H • NITRO: 100% READY', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#94a3b8',
    }).setOrigin(0.5);

    // Decorative cyber corner ticks on telemetry box
    const cornerTick = this.add.text(centerX + 115, centerY + 120, '◢', {
      fontSize: '10px',
      color: '#ff5500',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: [vehicleTag, cornerTick, statsTag],
      alpha: { from: 0.8, to: 1.0 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Title and branding with vibrant neon glow and cyber styling
   */
  private createBranding(x: number, y: number): void {
    const brandingGroup = this.add.container(x, y);

    // 1. Status Pill Tag
    const tagBg = this.add.graphics();
    tagBg.fillStyle(0x00f0ff, 0.12);
    tagBg.lineStyle(1, 0x00f0ff, 0.5);
    tagBg.strokeRoundedRect(-170, -78, 340, 24, 4);
    tagBg.fillRoundedRect(-170, -78, 340, 24, 4);
    brandingGroup.add(tagBg);

    const statusDot = this.add.circle(-150, -66, 4, 0x00f0ff);
    brandingGroup.add(statusDot);
    this.tweens.add({
      targets: statusDot,
      alpha: { from: 0.3, to: 1 },
      scale: { from: 0.8, to: 1.3 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    const tagText = this.add.text(-135, -66, 'SYSTEM ONLINE // REGION: GLOBAL GRID', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#00f0ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    brandingGroup.add(tagText);

    // 2. Main Title: NITRO RUSH
    // Outer Glow / Shadow Text
    const titleGlow = this.add.text(0, -10, 'NITRO RUSH', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '68px',
      color: '#ff3300',
      fontStyle: 'italic',
      stroke: '#ff1100',
      strokeThickness: 14,
    }).setOrigin(0.5);
    titleGlow.setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
    brandingGroup.add(titleGlow);

    // Foreground High-Contrast Text
    const titleMain = this.add.text(0, -10, 'NITRO RUSH', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '68px',
      fontStyle: 'italic',
      color: '#ffffff',
      stroke: '#080811',
      strokeThickness: 6,
    }).setOrigin(0.5);
    brandingGroup.add(titleMain);

    // Subtle title breathing animation
    this.tweens.add({
      targets: [titleGlow, titleMain],
      scale: { from: 0.98, to: 1.02 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 3. Neon Divider Line with Animated Scanner Pulse
    const divider = this.add.graphics();
    divider.lineStyle(2, 0xff5500, 0.8);
    divider.lineBetween(-170, 36, 170, 36);
    brandingGroup.add(divider);

    const scannerSpark = this.add.circle(-170, 36, 4, 0x00f0ff);
    scannerSpark.setBlendMode(Phaser.BlendModes.ADD);
    brandingGroup.add(scannerSpark);

    this.tweens.add({
      targets: scannerSpark,
      x: { from: -170, to: 170 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 4. Subtitle: MULTIPLAYER ARCADE RACING
    const subtitle = this.add.text(0, 56, 'MULTIPLAYER ARCADE RACING', {
      fontFamily: '"Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      color: '#38bdf8',
      letterSpacing: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    brandingGroup.add(subtitle);
  }

  /**
   * Vertical stack of polished cyber buttons
   */
  private createMenuButtons(centerX: number, startY: number): void {
    const buttonSpacing = 60;

    // 1. PLAY BUTTON (Primary highlight button - Single Player)
    this.createCyberButton({
      x: centerX,
      y: startY,
      width: 320,
      height: 52,
      label: 'PLAY RACE',
      icon: '▶',
      isPrimary: true,
      onClick: () => this.handlePlayClick(),
    });

    // 2. MULTIPLAYER BUTTON (Multiplayer Lobby & Matchmaking)
    this.createCyberButton({
      x: centerX,
      y: startY + buttonSpacing,
      width: 320,
      height: 48,
      label: 'MULTIPLAYER',
      icon: '🌐',
      isPrimary: false,
      onClick: () => this.handleMultiplayerClick(),
    });

    // 3. GARAGE BUTTON (Vehicle stats and inspection)
    this.createCyberButton({
      x: centerX,
      y: startY + buttonSpacing * 2,
      width: 320,
      height: 48,
      label: 'GARAGE',
      icon: '⛯',
      isPrimary: false,
      onClick: () => this.handleGarageClick(),
    });

    // 4. SETTINGS BUTTON (Preferences modal)
    this.createCyberButton({
      x: centerX,
      y: startY + buttonSpacing * 3,
      width: 320,
      height: 48,
      label: 'SETTINGS',
      icon: '⚙',
      isPrimary: false,
      onClick: () => this.handleSettingsClick(),
    });
  }

  /**
   * Reusable sci-fi chamfered button with smooth hover and click animations
   */
  private createCyberButton(config: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    icon: string;
    isPrimary: boolean;
    onClick: () => void;
  }): Phaser.GameObjects.Container {
    const { x, y, width, height, label, icon, isPrimary, onClick } = config;
    const chamfer = 10;
    const container = this.add.container(x, y);

    const bgGraphics = this.add.graphics();
    container.add(bgGraphics);

    // Initial draw
    this.renderButtonShape(bgGraphics, width, height, chamfer, isPrimary, false);

    // Button Text & Icon
    const textColor = isPrimary ? '#ffffff' : '#e2e8f0';
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: isPrimary ? '20px' : '17px',
      color: textColor,
      letterSpacing: 2,
    };

    const displayText = `${icon}  ${label}`;
    const text = this.add.text(0, 0, displayText, textStyle).setOrigin(0.5);
    container.add(text);

    // Hit Area
    container.setSize(width, height);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    // Hover Animation
    container.on('pointerover', () => {
      if (this.isModalOpen) return;
      SoundEffects.playHover();

      this.renderButtonShape(bgGraphics, width, height, chamfer, isPrimary, true);

      this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 160,
        ease: 'Quad.easeOut',
      });

      text.setColor(isPrimary ? '#ffffff' : '#00f0ff');
    });

    // Pointer Out
    container.on('pointerout', () => {
      this.renderButtonShape(bgGraphics, width, height, chamfer, isPrimary, false);

      this.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 160,
        ease: 'Quad.easeOut',
      });

      text.setColor(textColor);
    });

    // Click Animation
    container.on('pointerdown', () => {
      if (this.isModalOpen) return;
      SoundEffects.playClick();

      this.tweens.add({
        targets: container,
        scaleX: 0.96,
        scaleY: 0.96,
        duration: 80,
        yoyo: true,
        onComplete: () => {
          this.triggerButtonSparks(container.x, container.y, isPrimary);
          onClick();
        },
      });
    });

    return container;
  }

  /**
   * Draws a futuristic chamfered rectangle button shape
   */
  private renderButtonShape(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    chamfer: number,
    isPrimary: boolean,
    isHovered: boolean
  ): void {
    g.clear();
    const halfW = w / 2;
    const halfH = h / 2;

    const fillColor = isPrimary
      ? isHovered ? 0xff4400 : 0xe63900
      : isHovered ? 0x162238 : 0x0c1322;
    const fillAlpha = isPrimary ? (isHovered ? 0.95 : 0.85) : (isHovered ? 0.9 : 0.7);

    const borderColor = isPrimary
      ? isHovered ? 0xffffff : 0xff7700
      : isHovered ? 0x00f0ff : 0x334155;
    const borderWidth = isHovered ? 2.5 : 1.5;

    // Chamfered Path
    g.fillStyle(fillColor, fillAlpha);
    g.beginPath();
    g.moveTo(-halfW + chamfer, -halfH);
    g.lineTo(halfW - chamfer, -halfH);
    g.lineTo(halfW, -halfH + chamfer);
    g.lineTo(halfW, halfH - chamfer);
    g.lineTo(halfW - chamfer, halfH);
    g.lineTo(-halfW + chamfer, halfH);
    g.lineTo(-halfW, halfH - chamfer);
    g.lineTo(-halfW, -halfH + chamfer);
    g.closePath();
    g.fillPath();

    g.lineStyle(borderWidth, borderColor, 0.95);
    g.strokePath();

    // Secondary decorative cyber corner notches
    if (isHovered) {
      g.lineStyle(3, isPrimary ? 0xffffff : 0x00f0ff, 1);
      g.lineBetween(-halfW + 4, -halfH + 4, -halfW + 16, -halfH + 4);
      g.lineBetween(halfW - 16, halfH - 4, halfW - 4, halfH - 4);
    }
  }

  /**
   * Particle burst when clicking a button
   */
  private triggerButtonSparks(x: number, y: number, isPrimary: boolean): void {
    const texture = isPrimary ? 'particle_orange' : 'particle_blue';
    const emitter = this.add.particles(x, y, texture, {
      speed: { min: 80, max: 240 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 350,
      quantity: 14,
      blendMode: 'ADD',
    });

    this.time.delayedCall(400, () => {
      emitter.destroy();
    });
  }

  /**
   * Play button action: triggers nitro launch effect and transitions to TrackSelectScene
   */
  private handlePlayClick(): void {
    SoundEffects.playNitroLaunch();

    // Camera flash & minor shake
    this.cameras.main.flash(200, 255, 80, 0);
    this.cameras.main.shake(200, 0.005);

    // Large nitro burst at hero car
    if (this.heroCarContainer) {
      this.triggerButtonSparks(this.heroCarContainer.x, this.heroCarContainer.y + 60, true);
    }

    this.time.delayedCall(220, () => {
      this.cameras.main.fadeOut(250, 7, 10, 20);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('TrackSelectScene');
      });
    });
  }

  /**
   * Multiplayer button action: transitions to MultiplayerLobbyScene
   */
  private handleMultiplayerClick(): void {
    SoundEffects.playClick();

    this.cameras.main.flash(200, 0, 240, 255);
    this.time.delayedCall(160, () => {
      this.cameras.main.fadeOut(250, 7, 10, 20);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MultiplayerLobbyScene');
      });
    });
  }

  /**
   * Garage button action: transitions to GarageScene
   */
  private handleGarageClick(): void {
    SoundEffects.playClick();

    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GarageScene', { fromTrackSelect: false });
    });
  }

  /**
   * Settings button action: opens interactive preferences modal with localStorage persistence
   */
  private handleSettingsClick(): void {
    SoundEffects.playModalOpen();
    this.openSettingsModal();
  }

  /**
   * Displays interactive settings modal for audio, volume, screen shake, and minimap
   */
  private openSettingsModal(): void {
    if (this.isModalOpen) this.closeModal();
    this.isModalOpen = true;

    const { width, height } = this.scale;
    this.modalContainer = this.add.container(width / 2, height / 2).setDepth(100);

    // Dark backdrop overlay
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.78);
    backdrop.fillRect(-width / 2, -height / 2, width, height);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    this.modalContainer.add(backdrop);

    const modalW = 580;
    const modalH = 430;
    const frame = this.add.graphics();
    frame.fillStyle(0x0a1020, 0.98);
    frame.fillRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 10);
    frame.lineStyle(2, 0x00f0ff, 0.9);
    frame.strokeRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 10);

    // Decorative header bar
    frame.fillStyle(0x00f0ff, 0.15);
    frame.fillRoundedRect(-modalW / 2 + 2, -modalH / 2 + 2, modalW - 4, 46, { tl: 10, tr: 10, bl: 0, br: 0 });
    this.modalContainer.add(frame);

    const title = this.add.text(0, -modalH / 2 + 23, 'SYSTEM & AUDIO PREFERENCES', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.modalContainer.add(title);

    const tag = this.add.text(0, -modalH / 2 + 58, '// LOCAL STORAGE PERSISTENCE: nitro_rush_settings //', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.modalContainer.add(tag);

    // Interactive Rows Container
    const rowsContainer = this.add.container(0, -modalH / 2 + 82);
    this.modalContainer.add(rowsContainer);

    const renderRows = () => {
      rowsContainer.removeAll(true);
      const s = settingsManager.getSettings();

      const items = [
        {
          label: 'PROCEDURAL SFX AUDIO',
          value: s.soundEnabled ? 'ENABLED' : 'MUTED',
          color: s.soundEnabled ? '#10b981' : '#ef4444',
          action: () => {
            settingsManager.setSoundEnabled(!s.soundEnabled);
            SoundEffects.playClick();
            renderRows();
          },
        },
        {
          label: `MASTER AUDIO VOLUME (${Math.round(s.masterVolume * 100)}%)`,
          value: s.masterVolume <= 0 ? '0%' : `${Math.round(s.masterVolume * 100)}%`,
          color: '#00f0ff',
          isStepper: true,
          stepDown: () => {
            const next = Math.max(0, Math.round((s.masterVolume - 0.2) * 10) / 10);
            settingsManager.setMasterVolume(next);
            SoundEffects.playClick();
            renderRows();
          },
          stepUp: () => {
            const next = Math.min(1.0, Math.round((s.masterVolume + 0.2) * 10) / 10);
            settingsManager.setMasterVolume(next);
            SoundEffects.playClick();
            renderRows();
          },
        },
        {
          label: 'CAMERA NITRO SHAKE',
          value: s.screenShakeEnabled ? 'ENABLED' : 'DISABLED',
          color: s.screenShakeEnabled ? '#10b981' : '#94a3b8',
          action: () => {
            settingsManager.setScreenShake(!s.screenShakeEnabled);
            SoundEffects.playClick();
            renderRows();
          },
        },
        {
          label: 'WARP SPEED STREAKS',
          value: s.speedStreaksEnabled ? 'ENABLED' : 'DISABLED',
          color: s.speedStreaksEnabled ? '#10b981' : '#94a3b8',
          action: () => {
            settingsManager.setSpeedStreaks(!s.speedStreaksEnabled);
            SoundEffects.playClick();
            renderRows();
          },
        },
        {
          label: 'RACE RADAR MINIMAP',
          value: s.minimapEnabled ? 'ENABLED' : 'DISABLED',
          color: s.minimapEnabled ? '#10b981' : '#94a3b8',
          action: () => {
            settingsManager.setMinimapEnabled(!s.minimapEnabled);
            SoundEffects.playClick();
            renderRows();
          },
        },
      ];

      items.forEach((item, idx) => {
        const ry = idx * 48;

        // Row background
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0x0e172a, 0.85);
        rowBg.fillRoundedRect(-modalW / 2 + 25, ry, modalW - 50, 40, 4);
        rowBg.lineStyle(1, 0x1e293b, 0.8);
        rowBg.strokeRoundedRect(-modalW / 2 + 25, ry, modalW - 50, 40, 4);
        rowsContainer.add(rowBg);

        const lbl = this.add.text(-modalW / 2 + 40, ry + 13, item.label, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#e2e8f0',
          fontStyle: 'bold',
        });
        rowsContainer.add(lbl);

        if (item.isStepper) {
          // Down button
          const btnDown = this.add.text(modalW / 2 - 135, ry + 10, '◄', {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#00f0ff',
            fontStyle: 'bold',
          }).setInteractive({ useHandCursor: true });
          btnDown.on('pointerdown', item.stepDown);

          const valText = this.add.text(modalW / 2 - 95, ry + 12, item.value, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffffff',
            fontStyle: 'bold',
          }).setOrigin(0.5, 0);

          // Up button
          const btnUp = this.add.text(modalW / 2 - 55, ry + 10, '►', {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#00f0ff',
            fontStyle: 'bold',
          }).setInteractive({ useHandCursor: true });
          btnUp.on('pointerdown', item.stepUp);

          rowsContainer.add([btnDown, valText, btnUp]);
        } else {
          const btn = this.add.container(modalW / 2 - 80, ry + 20);
          const btnBg = this.add.graphics();
          btnBg.fillStyle(0x1e293b, 1);
          btnBg.fillRoundedRect(-45, -12, 90, 24, 3);
          btnBg.lineStyle(1, item.value === 'ENABLED' ? 0x10b981 : 0x475569, 1);
          btnBg.strokeRoundedRect(-45, -12, 90, 24, 3);
          btn.add(btnBg);

          const btnText = this.add.text(0, 0, item.value, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: item.color,
            fontStyle: 'bold',
          }).setOrigin(0.5);
          btn.add(btnText);

          btn.setSize(90, 24);
          btn.setInteractive({ useHandCursor: true });
          if (item.action) {
            btn.on('pointerdown', item.action);
          }
          rowsContainer.add(btn);
        }
      });
    };

    renderRows();

    // Footer buttons
    const closeBtn = this.createCyberButton({
      x: modalW / 4 - 20,
      y: modalH / 2 - 38,
      width: 220,
      height: 40,
      label: 'CLOSE & SAVE',
      icon: '✓',
      isPrimary: true,
      onClick: () => this.closeModal(),
    });
    this.modalContainer.add(closeBtn);

    const resetBtn = this.createCyberButton({
      x: -modalW / 4 + 20,
      y: modalH / 2 - 38,
      width: 200,
      height: 40,
      label: 'DEFAULTS',
      icon: '↺',
      isPrimary: false,
      onClick: () => {
        settingsManager.resetToDefaults();
        SoundEffects.playClick();
        renderRows();
      },
    });
    this.modalContainer.add(resetBtn);

    // Modal Entrance Animation (scale punch)
    this.modalContainer.setScale(0.85);
    this.modalContainer.setAlpha(0);
    this.tweens.add({
      targets: this.modalContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Closes the active modal with smooth exit transition
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
      duration: 140,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.modalContainer?.destroy();
        this.modalContainer = null;
      },
    });
  }

  /**
   * Footer bar with subtle controls and developer signature
   */
  private createFooter(width: number, height: number): void {
    const footerY = height - 22;

    this.add.text(40, footerY, 'NITRO RUSH • V0.2.0 PROTOTYPE • ARCADE ENGINE', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#475569',
    }).setOrigin(0, 0.5);

    this.add.text(width - 40, footerY, '[ESC] DISMISS • [CLICK] INTERACT', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#475569',
    }).setOrigin(1, 0.5);
  }

  /**
   * Main per-frame update loop for animated background particles and speed grid
   */
  update(_time: number, delta: number): void {
    const { width, height } = this.scale;
    const dt = delta / 1000;

    // 0. Animate Scrolling Background Cyber Grid
    if (this.backgroundGrid) {
      this.backgroundGrid.clear();
      this.backgroundGrid.lineStyle(1, 0x00f0ff, 0.06);

      const lineSpacing = 48;
      this.gridScrollY = (this.gridScrollY + dt * 100) % lineSpacing;
      for (let y = this.gridScrollY; y < height; y += lineSpacing) {
        this.backgroundGrid.lineBetween(0, y, width, y);
      }

      const colSpacing = 80;
      for (let x = 0; x < width; x += colSpacing) {
        this.backgroundGrid.lineBetween(x, 0, x, height);
      }
    }

    // 1. Animate Speed Streaks downwards
    for (let i = 0; i < this.speedStreaks.length; i++) {
      const item = this.speedStreaks[i];
      item.sprite.y += item.speed * dt;
      if (item.sprite.y > height + 80) {
        item.sprite.y = -80;
        item.sprite.x = Phaser.Math.Between(10, width - 10);
      }
    }

    // 2. Animate Embers rising upwards with horizontal wobble
    const timeSec = _time / 1000;
    for (let i = 0; i < this.emberParticles.length; i++) {
      const ember = this.emberParticles[i];
      ember.sprite.y -= ember.speedY * dt;
      ember.sprite.x = ember.startX + Math.sin(timeSec * ember.wobbleSpeed + i) * ember.wobbleDist;

      if (ember.sprite.y < -20) {
        ember.sprite.y = height + 20;
        ember.startX = Phaser.Math.Between(20, width - 20);
      }
    }

    // 3. Animate Pedestal Turntable Ring
    if (this.pedestalRing) {
      this.gridOffsetY = (this.gridOffsetY + dt * 1.5) % (Math.PI * 2);
      this.pedestalRing.clear();

      // Outer turntable ellipse
      this.pedestalRing.lineStyle(2, 0xff5500, 0.7);
      this.pedestalRing.strokeEllipse(0, 0, 220, 100);

      // Inner turntable ellipse
      this.pedestalRing.lineStyle(1, 0x00f0ff, 0.5);
      this.pedestalRing.strokeEllipse(0, 0, 170, 75);

      // Rotating tick marks along turntable perimeter
      const tickCount = 12;
      for (let t = 0; t < tickCount; t++) {
        const angle = (t / tickCount) * Math.PI * 2 + this.gridOffsetY;
        const tx = Math.cos(angle) * 110;
        const ty = Math.sin(angle) * 50;
        this.pedestalRing.fillStyle(t % 2 === 0 ? 0xff5500 : 0x00f0ff, 0.8);
        this.pedestalRing.fillCircle(tx, ty, 2.5);
      }
    }
  }
}
