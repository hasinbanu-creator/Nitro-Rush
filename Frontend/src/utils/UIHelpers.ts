import Phaser from 'phaser';
import { SoundEffects } from './SoundEffects';

export const CYBER_THEME = {
  // Primary Accents
  CYAN: 0x00f3ff,
  CYAN_HEX: '#00f3ff',
  CYAN_GLOW: 0x38bdf8,
  CYAN_GLOW_HEX: '#38bdf8',
  CYAN_MUTED: 0x0284c7,
  CYAN_MUTED_HEX: '#0284c7',

  // Secondary Accents
  PURPLE: 0xb026ff,
  PURPLE_HEX: '#b026ff',
  PURPLE_LIGHT: 0xd946ef,
  PURPLE_LIGHT_HEX: '#d946ef',
  PURPLE_MUTED: 0x7e22ce,
  PURPLE_MUTED_HEX: '#7e22ce',

  // Status & Functional Accents
  EMERALD: 0x00ff9d,
  EMERALD_HEX: '#00ff9d',
  CRIMSON: 0xff0055,
  CRIMSON_HEX: '#ff0055',
  AMBER: 0xffb700,
  AMBER_HEX: '#ffb700',

  // Dark Futuristic Backgrounds & Glass Surfaces
  BG_DARK: 0x050811,
  BG_DARK_HEX: '#050811',
  BG_NAVY: 0x0a1020,
  BG_NAVY_HEX: '#0a1020',
  BG_GLASS: 0x0c1426,
  BG_GLASS_HEX: '#0c1426',
  BG_GLASS_HOVER: 0x142038,
  BG_CARD: 0x0e172a,

  // Text Colors
  TEXT_WHITE: '#ffffff',
  TEXT_CYAN: '#00f3ff',
  TEXT_PURPLE: '#d8b4fe',
  TEXT_MUTED: '#94a3b8',
  TEXT_DARK: '#050811',

  // Typography
  FONT_DISPLAY: '"Orbitron", "Impact", "Arial Black", sans-serif',
  FONT_BODY: '"Rajdhani", "Segoe UI", sans-serif',
  FONT_MONO: '"Consolas", "Courier New", Courier, monospace',
};

export type CyberButtonVariant = 'primary' | 'secondary' | 'purple' | 'danger' | 'success' | 'ghost';

export interface CyberButtonConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  icon?: string;
  isPrimary?: boolean;
  variant?: CyberButtonVariant;
  accentColor?: number;
  fontSize?: string;
  onClick: () => void;
}

export class UIHelpers {
  /**
   * Creates a reusable cyber button with chamfered edges, hover/click tweens, and audio feedback.
   * Conforms strictly to the Neon Cyberpunk aesthetic with Electric Cyan & Neon Purple accents.
   */
  public static createCyberButton(config: CyberButtonConfig): Phaser.GameObjects.Container {
    const {
      scene,
      x,
      y,
      width,
      height,
      label,
      icon = '',
      isPrimary = false,
      variant: explicitVariant,
      accentColor,
      fontSize,
      onClick,
    } = config;

    const variant: CyberButtonVariant = explicitVariant ?? (isPrimary ? 'primary' : 'secondary');
    const chamfer = 8;
    const container = scene.add.container(x, y);

    const bgGraphics = scene.add.graphics();
    container.add(bgGraphics);

    const effectiveAccent = accentColor ?? (variant === 'purple' ? CYBER_THEME.PURPLE : CYBER_THEME.CYAN);
    this.drawButtonVariant(bgGraphics, width, height, chamfer, variant, false, effectiveAccent);

    // Primary has dark high-contrast text on electric cyan fill
    const defaultTextColor = variant === 'primary' 
      ? CYBER_THEME.TEXT_DARK 
      : (variant === 'danger' ? CYBER_THEME.CRIMSON_HEX : (variant === 'success' ? CYBER_THEME.EMERALD_HEX : CYBER_THEME.TEXT_WHITE));

    const defaultFontSize = fontSize || (variant === 'primary' ? '18px' : '15px');
    const displayText = icon ? `${icon}  ${label}` : label;
    const text = scene.add.text(0, 0, displayText, {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: defaultFontSize,
      color: defaultTextColor,
      fontStyle: 'bold',
      letterSpacing: 1.5,
    }).setOrigin(0.5);
    container.add(text);

    container.setSize(width, height);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    container.on('pointerover', () => {
      SoundEffects.playHover();
      this.drawButtonVariant(bgGraphics, width, height, chamfer, variant, true, effectiveAccent);
      scene.tweens.add({
        targets: container,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 140,
        ease: 'Quad.easeOut',
      });
      if (variant === 'primary') {
        text.setColor(CYBER_THEME.TEXT_DARK);
      } else {
        text.setColor(variant === 'purple' ? CYBER_THEME.PURPLE_LIGHT_HEX : CYBER_THEME.CYAN_HEX);
      }
    });

    container.on('pointerout', () => {
      this.drawButtonVariant(bgGraphics, width, height, chamfer, variant, false, effectiveAccent);
      scene.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 140,
        ease: 'Quad.easeOut',
      });
      text.setColor(defaultTextColor);
    });

    container.on('pointerdown', () => {
      SoundEffects.playClick();
      scene.tweens.add({
        targets: container,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 70,
        yoyo: true,
        onComplete: () => {
          onClick();
        },
      });
    });

    return container;
  }

  /**
   * Renders the sci-fi chamfered button geometry based on variant
   */
  public static drawButtonVariant(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    chamfer: number,
    variant: CyberButtonVariant,
    isHovered: boolean,
    accentColor: number
  ): void {
    g.clear();
    const halfW = w / 2;
    const halfH = h / 2;

    let fillColor: number;
    let fillAlpha: number;
    let borderColor: number;
    let borderWidth: number;

    switch (variant) {
      case 'primary':
        // Electric Cyan solid with subtle glow
        fillColor = isHovered ? 0x38bdf8 : CYBER_THEME.CYAN;
        fillAlpha = isHovered ? 1.0 : 0.95;
        borderColor = 0xffffff;
        borderWidth = isHovered ? 2.5 : 1.5;
        break;

      case 'purple':
        fillColor = isHovered ? 0x9333ea : CYBER_THEME.PURPLE;
        fillAlpha = isHovered ? 1.0 : 0.9;
        borderColor = isHovered ? 0xffffff : CYBER_THEME.PURPLE_LIGHT;
        borderWidth = isHovered ? 2.5 : 1.5;
        break;

      case 'danger':
        fillColor = isHovered ? 0x4c0519 : 0x240a14;
        fillAlpha = isHovered ? 0.95 : 0.85;
        borderColor = isHovered ? 0xff4d7d : CYBER_THEME.CRIMSON;
        borderWidth = isHovered ? 2.5 : 1.5;
        break;

      case 'success':
        fillColor = isHovered ? 0x064e3b : 0x022c22;
        fillAlpha = isHovered ? 0.95 : 0.85;
        borderColor = isHovered ? 0x34d399 : CYBER_THEME.EMERALD;
        borderWidth = isHovered ? 2.5 : 1.5;
        break;

      case 'secondary':
      default:
        // Dark Glass with Electric Cyan border
        fillColor = isHovered ? CYBER_THEME.BG_GLASS_HOVER : CYBER_THEME.BG_GLASS;
        fillAlpha = isHovered ? 0.95 : 0.85;
        borderColor = isHovered ? 0xffffff : accentColor;
        borderWidth = isHovered ? 2.0 : 1.5;
        break;
    }

    // Chamfered Hexagonal/Octagonal Button Path
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

    // Subtle neon corner accent ticks on hover
    if (isHovered) {
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(-halfW + 4, -halfH + 4, -halfW + 12, -halfH + 4);
      g.lineBetween(halfW - 12, halfH - 4, halfW - 4, halfH - 4);
    }
  }

  /**
   * Backwards-compatible drawButton shim for legacy calls
   */
  public static drawButton(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    chamfer: number,
    isPrimary: boolean,
    isHovered: boolean,
    accentColor: number
  ): void {
    const variant: CyberButtonVariant = isPrimary ? 'primary' : 'secondary';
    this.drawButtonVariant(g, w, h, chamfer, variant, isHovered, accentColor);
  }

  /**
   * Draws a standardized Neon Cyberpunk glass panel with glowing neon borders
   */
  public static drawGlassPanel(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    options: {
      radius?: number;
      borderColor?: number;
      borderAlpha?: number;
      fillColor?: number;
      fillAlpha?: number;
      headerHeight?: number;
      headerColor?: number;
    } = {}
  ): void {
    const radius = options.radius ?? 8;
    const borderColor = options.borderColor ?? CYBER_THEME.CYAN;
    const borderAlpha = options.borderAlpha ?? 0.6;
    const fillColor = options.fillColor ?? CYBER_THEME.BG_NAVY;
    const fillAlpha = options.fillAlpha ?? 0.92;

    // Glass Background Fill
    g.fillStyle(fillColor, fillAlpha);
    g.fillRoundedRect(x, y, w, h, radius);

    // Neon Border
    g.lineStyle(1.5, borderColor, borderAlpha);
    g.strokeRoundedRect(x, y, w, h, radius);

    // Optional Accent Header Strip
    if (options.headerHeight && options.headerHeight > 0) {
      const headerColor = options.headerColor ?? CYBER_THEME.CYAN;
      g.fillStyle(headerColor, 0.12);
      g.fillRoundedRect(x + 1, y + 1, w - 2, options.headerHeight, {
        tl: radius,
        tr: radius,
        bl: 0,
        br: 0,
      });
      g.lineStyle(1, headerColor, 0.5);
      g.lineBetween(x + 1, y + options.headerHeight, x + w - 1, y + options.headerHeight);
    }
  }

  /**
   * Creates a standardized dark futuristic background with ambient Cyan/Purple glow and particles
   */
  public static createCyberAtmosphere(
    scene: Phaser.Scene,
    width: number,
    height: number
  ): { grid: Phaser.GameObjects.Graphics; orbs: Phaser.GameObjects.Sprite[] } {
    // 1. Deep Navy/Black Gradient
    const bg = scene.add.graphics();
    bg.fillGradientStyle(CYBER_THEME.BG_DARK, CYBER_THEME.BG_DARK, 0x080d1a, 0x060914, 1);
    bg.fillRect(0, 0, width, height);

    // 2. Dynamic Animated Cyber Grid
    const grid = scene.add.graphics();
    const orbs: Phaser.GameObjects.Sprite[] = [];

    // 3. Ambient Electric Cyan Orb (Bottom-Left)
    const cyanGlow = scene.add.sprite(width * 0.15, height * 0.85, 'glow_orb')
      .setScale(3.5)
      .setTint(CYBER_THEME.CYAN)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    orbs.push(cyanGlow);

    scene.tweens.add({
      targets: cyanGlow,
      alpha: { from: 0.15, to: 0.28 },
      scale: { from: 3.2, to: 3.8 },
      duration: 3800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 4. Ambient Neon Purple Orb (Top-Right)
    const purpleGlow = scene.add.sprite(width * 0.85, height * 0.15, 'glow_orb')
      .setScale(3.2)
      .setTint(CYBER_THEME.PURPLE)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    orbs.push(purpleGlow);

    scene.tweens.add({
      targets: purpleGlow,
      alpha: { from: 0.15, to: 0.28 },
      scale: { from: 3.0, to: 3.6 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return { grid, orbs };
  }

  /**
   * Creates a standardized screen header with title, subtitle, and optional back button
   */
  public static createCyberHeader(
    scene: Phaser.Scene,
    width: number,
    title: string,
    subtitle: string,
    onBack?: () => void
  ): Phaser.GameObjects.Container {
    const header = scene.add.container(0, 0).setDepth(50);

    // Subtle header background strip
    const bar = scene.add.graphics();
    bar.fillStyle(CYBER_THEME.BG_NAVY, 0.7);
    bar.fillRect(0, 0, width, 70);
    bar.lineStyle(1, CYBER_THEME.CYAN, 0.3);
    bar.lineBetween(0, 70, width, 70);
    header.add(bar);

    // Glowing divider scanline
    const scanline = scene.add.graphics();
    scanline.lineStyle(1.5, CYBER_THEME.PURPLE, 0.8);
    scanline.lineBetween(width * 0.2, 70, width * 0.8, 70);
    header.add(scanline);

    // Title
    const titleText = scene.add.text(onBack ? 160 : width / 2, 26, title, {
      fontFamily: CYBER_THEME.FONT_DISPLAY,
      fontSize: '24px',
      color: CYBER_THEME.TEXT_WHITE,
      fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(onBack ? 0 : 0.5, 0.5);
    header.add(titleText);

    // Subtitle
    const subText = scene.add.text(onBack ? 160 : width / 2, 50, `// ${subtitle} //`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(onBack ? 0 : 0.5, 0.5);
    header.add(subText);

    // Optional Back Button
    if (onBack) {
      const backBtn = this.createCyberButton({
        scene,
        x: 80,
        y: 35,
        width: 110,
        height: 38,
        label: 'BACK',
        icon: '◄',
        isPrimary: false,
        onClick: onBack,
      });
      header.add(backBtn);
    }

    return header;
  }

  /**
   * Creates an animated cyber stat bar (e.g. Top Speed 88/100) in Electric Cyan with Neon Purple track
   */
  public static createStatBar(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    value: number, // 0 to 100
    color: number = CYBER_THEME.CYAN
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);

    // Label
    const labelText = scene.add.text(0, -10, label, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.TEXT_MUTED,
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0, 0.5);

    // Value Text
    const valueText = scene.add.text(width, -10, `${value}%`, {
      fontFamily: CYBER_THEME.FONT_MONO,
      fontSize: '11px',
      color: CYBER_THEME.CYAN_HEX,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5);

    // Background Track (Dark with subtle purple border)
    const bgBar = scene.add.graphics();
    bgBar.fillStyle(CYBER_THEME.BG_NAVY, 0.95);
    bgBar.lineStyle(1, CYBER_THEME.PURPLE, 0.4);
    bgBar.strokeRoundedRect(0, 0, width, 10, 3);
    bgBar.fillRoundedRect(0, 0, width, 10, 3);

    // Animated Fill Bar
    const fillBar = scene.add.graphics();
    container.add([labelText, valueText, bgBar, fillBar]);

    // Animate fill smoothly from 0 to value
    scene.tweens.addCounter({
      from: 0,
      to: value,
      duration: 600,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        const currentVal = tween.getValue() ?? 0;
        fillBar.clear();
        fillBar.fillStyle(color, 0.95);
        fillBar.fillRoundedRect(1, 1, Math.max(0, (width - 2) * (currentVal / 100)), 8, 2);
      },
    });

    return container;
  }
}
