import Phaser from 'phaser';
import { SoundEffects } from './SoundEffects';

export interface CyberButtonConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  icon?: string;
  isPrimary?: boolean;
  accentColor?: number;
  fontSize?: string;
  onClick: () => void;
}

export class UIHelpers {
  /**
   * Creates a reusable cyber button with chamfered edges, hover/click tweens, and audio feedback
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
      accentColor,
      fontSize = isPrimary ? '18px' : '15px',
      onClick,
    } = config;

    const chamfer = 8;
    const container = scene.add.container(x, y);

    const bgGraphics = scene.add.graphics();
    container.add(bgGraphics);

    const primaryAccent = accentColor ?? (isPrimary ? 0xff5500 : 0x00f0ff);
    this.drawButton(bgGraphics, width, height, chamfer, isPrimary, false, primaryAccent);

    const textColor = isPrimary ? '#ffffff' : '#e2e8f0';
    const displayText = icon ? `${icon}  ${label}` : label;
    const text = scene.add.text(0, 0, displayText, {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize,
      color: textColor,
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
      this.drawButton(bgGraphics, width, height, chamfer, isPrimary, true, primaryAccent);
      scene.tweens.add({
        targets: container,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 140,
        ease: 'Quad.easeOut',
      });
      text.setColor('#ffffff');
    });

    container.on('pointerout', () => {
      this.drawButton(bgGraphics, width, height, chamfer, isPrimary, false, primaryAccent);
      scene.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 140,
        ease: 'Quad.easeOut',
      });
      text.setColor(textColor);
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
   * Renders the sci-fi chamfered button geometry
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
    g.clear();
    const halfW = w / 2;
    const halfH = h / 2;

    const fillColor = isPrimary
      ? isHovered ? accentColor : 0xcc3300
      : isHovered ? 0x142033 : 0x0c1322;
    const fillAlpha = isPrimary ? (isHovered ? 0.95 : 0.85) : (isHovered ? 0.9 : 0.75);

    const borderColor = isHovered ? 0xffffff : accentColor;
    const borderWidth = isHovered ? 2.5 : 1.5;

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

    if (isHovered) {
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(-halfW + 4, -halfH + 4, -halfW + 12, -halfH + 4);
      g.lineBetween(halfW - 12, halfH - 4, halfW - 4, halfH - 4);
    }
  }

  /**
   * Creates an animated cyber stat bar (e.g. Top Speed 88/100)
   */
  public static createStatBar(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    value: number, // 0 to 100
    color: number = 0x00f0ff
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);

    // Label
    const labelText = scene.add.text(0, -10, label, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#94a3b8',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Value Text
    const valueText = scene.add.text(width, -10, `${value}%`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5);

    // Background Track
    const bgBar = scene.add.graphics();
    bgBar.fillStyle(0x0f172a, 0.9);
    bgBar.lineStyle(1, 0x334155, 0.6);
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
        fillBar.fillStyle(color, 0.9);
        fillBar.fillRoundedRect(1, 1, Math.max(0, (width - 2) * (currentVal / 100)), 8, 2);
      },
    });

    return container;
  }
}

