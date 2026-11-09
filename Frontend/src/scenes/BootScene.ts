import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Generate all procedural textures immediately
    this.generateProceduralAssets();
  }

  create(): void {
    const { width, height } = this.scale;

    // Create a sleek futuristic loading bar
    const progressBox = this.add.graphics();
    const progressBar = this.add.graphics();

    progressBox.fillStyle(0x0e1424, 0.8);
    progressBox.lineStyle(2, 0xff5500, 0.9);
    progressBox.strokeRect(width / 2 - 160, height / 2, 320, 16);
    progressBox.fillRect(width / 2 - 160, height / 2, 320, 16);

    this.add.text(width / 2, height / 2 - 50, 'NITRO RUSH', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#ff3300',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const statusText = this.add.text(width / 2, height / 2 + 35, 'INITIALIZING GAME ENGINE...', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#00f0ff',
    }).setOrigin(0.5);

    // Smoothly animate progress bar and transition to MainMenuScene
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 350,
      onUpdate: (tween) => {
        const val = tween.getValue() ?? 0;
        progressBar.clear();
        progressBar.fillStyle(0xff5500, 1);
        progressBar.fillRect(width / 2 - 156, height / 2 + 4, 312 * val, 8);
      },
      onComplete: () => {
        statusText.setText('SYSTEMS READY');
        this.cameras.main.fadeOut(200, 7, 10, 20);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('MainMenuScene');
        });
      },
    });
  }

  /**
   * Generates procedural textures for particles, lights, and vehicles
   * avoiding any external copyrighted asset dependencies.
   */
  private generateProceduralAssets(): void {
    this.generateGlowParticle('particle_orange', '#ffffff', '#ff6600', '#ff1100');
    this.generateGlowParticle('particle_blue', '#ffffff', '#00f0ff', '#0044ff');
    this.generateGlowParticle('particle_green', '#ffffff', '#10b981', '#065f46');
    this.generateGlowParticle('particle_ember', '#ffffaa', '#ff7700', '#bb1100', 16);
    this.generateAmbientGlow('glow_orb', 128);
    this.generateSpeedStreak('speed_streak', 140, 4);

    // Procedural Cars
    this.generateBoltGT('car_bolt_gt');
    this.generateViperR('car_viper_r');
    this.generateRallyApex('car_rally_apex');
    this.generateTitanV8('car_titan_v8');
    // Maintain backwards compatibility with hero_car alias
    this.generateBoltGT('hero_car');
  }

  /**
   * Procedural BOLT GT: Tuner Pro street racer
   */
  private generateBoltGT(key: string): void {
    if (this.textures.exists(key)) return;
    const w = 70;
    const h = 130;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();

    // Chassis shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Bodywork
    ctx.fillStyle = '#161922';
    ctx.strokeStyle = '#2d3345';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.35, 10);
    ctx.quadraticCurveTo(w * 0.5, 4, w * 0.65, 10);
    ctx.lineTo(w * 0.85, 25);
    ctx.lineTo(w * 0.9, 50);
    ctx.lineTo(w * 0.95, 95);
    ctx.lineTo(w * 0.9, 120);
    ctx.lineTo(w * 0.1, 120);
    ctx.lineTo(w * 0.05, 95);
    ctx.lineTo(w * 0.1, 50);
    ctx.lineTo(w * 0.15, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Racing Accent Stripes (Neon Orange / Red)
    const stripeGrad = ctx.createLinearGradient(0, 0, 0, h);
    stripeGrad.addColorStop(0, '#ff7700');
    stripeGrad.addColorStop(1, '#ff1100');
    ctx.fillStyle = stripeGrad;

    ctx.beginPath();
    ctx.moveTo(w * 0.3, 16);
    ctx.lineTo(w * 0.38, 16);
    ctx.lineTo(w * 0.36, 114);
    ctx.lineTo(w * 0.28, 114);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w * 0.7, 16);
    ctx.lineTo(w * 0.62, 16);
    ctx.lineTo(w * 0.64, 114);
    ctx.lineTo(w * 0.72, 114);
    ctx.closePath();
    ctx.fill();

    // Tinted Cockpit
    const canopyGrad = ctx.createLinearGradient(0, 36, 0, 78);
    canopyGrad.addColorStop(0, '#0f172a');
    canopyGrad.addColorStop(0.5, '#0284c7');
    canopyGrad.addColorStop(1, '#082f49');
    ctx.fillStyle = canopyGrad;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.32, 40);
    ctx.quadraticCurveTo(w * 0.5, 34, w * 0.68, 40);
    ctx.lineTo(w * 0.74, 76);
    ctx.quadraticCurveTo(w * 0.5, 82, w * 0.26, 76);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dual Headlights
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(w * 0.22, 14, 8, 4);
    ctx.fillRect(w * 0.78 - 8, 14, 8, 4);

    // Rear Tail-light Bar
    ctx.fillStyle = '#ff1144';
    ctx.fillRect(w * 0.16, 118, w * 0.68, 4);

    // Dual Exhausts
    ctx.fillStyle = '#ff7700';
    ctx.fillRect(w * 0.32, 122, 6, 4);
    ctx.fillRect(w * 0.68 - 6, 122, 6, 4);

    canvas.refresh();
  }

  /**
   * Procedural VIPER R: Mid-Engine Exotic Hypercar
   */
  private generateViperR(key: string): void {
    if (this.textures.exists(key)) return;
    const w = 72;
    const h = 132;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Sharp Wedge Bodywork (Emerald Metallic)
    const bodyGrad = ctx.createLinearGradient(0, 0, w, 0);
    bodyGrad.addColorStop(0, '#064e3b');
    bodyGrad.addColorStop(0.5, '#10b981');
    bodyGrad.addColorStop(1, '#064e3b');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(w * 0.5, 6); // Pointed nose
    ctx.lineTo(w * 0.88, 22);
    ctx.lineTo(w * 0.84, 52); // Side air scoop tuck
    ctx.lineTo(w * 0.94, 78); // Rear flare
    ctx.lineTo(w * 0.92, 122);
    ctx.lineTo(w * 0.72, 126); // Diffuser notch
    ctx.lineTo(w * 0.28, 126);
    ctx.lineTo(w * 0.08, 122);
    ctx.lineTo(w * 0.06, 78);
    ctx.lineTo(w * 0.16, 52);
    ctx.lineTo(w * 0.12, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Carbon fiber roof and air intake scoop
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(w * 0.42, 32, w * 0.16, 26);

    // Jet Canopy
    const canopyGrad = ctx.createLinearGradient(0, 26, 0, 72);
    canopyGrad.addColorStop(0, '#022c22');
    canopyGrad.addColorStop(0.5, '#065f46');
    canopyGrad.addColorStop(1, '#022c22');
    ctx.fillStyle = canopyGrad;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 26);
    ctx.lineTo(w * 0.72, 42);
    ctx.lineTo(w * 0.70, 74);
    ctx.lineTo(w * 0.30, 74);
    ctx.lineTo(w * 0.28, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Twin aggressive gold racing stripes
    ctx.fillStyle = '#eab308';
    ctx.fillRect(w * 0.34, 12, 4, 108);
    ctx.fillRect(w * 0.62, 12, 4, 108);

    // Angular Xenon Headlights
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.22, 12, 10, 3);
    ctx.fillRect(w * 0.68, 12, 10, 3);

    // Quad Rear Diffuser Exhausts
    ctx.fillStyle = '#10b981';
    ctx.fillRect(w * 0.32, 124, 4, 5);
    ctx.fillRect(w * 0.40, 124, 4, 5);
    ctx.fillRect(w * 0.56, 124, 4, 5);
    ctx.fillRect(w * 0.64, 124, 4, 5);

    canvas.refresh();
  }

  /**
   * Procedural RALLY APEX: All-Terrain AWD Rally Beast
   */
  private generateRallyApex(key: string): void {
    if (this.textures.exists(key)) return;
    const w = 68;
    const h = 124;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Compact Rally Hatchback (Electric Cyan)
    const bodyGrad = ctx.createLinearGradient(0, 0, w, 0);
    bodyGrad.addColorStop(0, '#0284c7');
    bodyGrad.addColorStop(0.5, '#00f0ff');
    bodyGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(w * 0.25, 8);
    ctx.lineTo(w * 0.75, 8);
    ctx.lineTo(w * 0.90, 22); // Wide front wheel arch flare
    ctx.lineTo(w * 0.86, 56);
    ctx.lineTo(w * 0.94, 88); // Wide rear rally arch
    ctx.lineTo(w * 0.88, 118);
    ctx.lineTo(w * 0.12, 118);
    ctx.lineTo(w * 0.06, 88);
    ctx.lineTo(w * 0.14, 56);
    ctx.lineTo(w * 0.10, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Roof scoop for rally cooling
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.40, 36, w * 0.20, 16);

    // Upright Rally Windshield
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(w * 0.22, 28, w * 0.56, 32);
    ctx.strokeRect(w * 0.22, 28, w * 0.56, 32);

    // Quad Front Rally Pod Lights on bumper
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(w * 0.24, 6, 8, 5);
    ctx.fillRect(w * 0.36, 6, 8, 5);
    ctx.fillRect(w * 0.56, 6, 8, 5);
    ctx.fillRect(w * 0.68, 6, 8, 5);

    // Rear High-Mount Rally Spoiler
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(w * 0.10, 114, w * 0.80, 7);

    // Red rally mudflaps at corners
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(w * 0.04, 116, 6, 6);
    ctx.fillRect(w * 0.90, 116, 6, 6);

    canvas.refresh();
  }

  /**
   * Procedural TITAN V8: Supercharged Muscle Brute
   */
  private generateTitanV8(key: string): void {
    if (this.textures.exists(key)) return;
    const w = 74;
    const h = 134;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Muscle Bodywork (Deep Crimson Red)
    const bodyGrad = ctx.createLinearGradient(0, 0, w, 0);
    bodyGrad.addColorStop(0, '#991b1b');
    bodyGrad.addColorStop(0.5, '#ef4444');
    bodyGrad.addColorStop(1, '#991b1b');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(w * 0.22, 6);
    ctx.lineTo(w * 0.78, 6); // Flat aggressive front grille
    ctx.lineTo(w * 0.88, 26);
    ctx.lineTo(w * 0.86, 62);
    ctx.lineTo(w * 0.94, 98); // Muscular rear haunches
    ctx.lineTo(w * 0.88, 126);
    ctx.lineTo(w * 0.12, 126);
    ctx.lineTo(w * 0.06, 98);
    ctx.lineTo(w * 0.14, 62);
    ctx.lineTo(w * 0.12, 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Wide Black Racing Center Stripe
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(w * 0.36, 6, w * 0.28, 120);

    // Supercharger Dual-Intake Cowl Blower on Hood
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(w * 0.38, 22, w * 0.24, 18);
    ctx.fillStyle = '#ff7700';
    ctx.fillRect(w * 0.40, 24, 6, 6);
    ctx.fillRect(w * 0.54, 24, 6, 6);

    // Cockpit Window
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(w * 0.24, 46, w * 0.52, 38);
    ctx.strokeRect(w * 0.24, 46, w * 0.52, 38);

    // Dual Halo Headlights
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(w * 0.18, 8, 8, 4);
    ctx.fillRect(w * 0.74, 8, 8, 4);

    // Massive Chrome Side Exhaust Pipes with Orange Glow
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(w * 0.02, 74, 4, 18);
    ctx.fillRect(w * 0.94, 74, 4, 18);
    ctx.fillStyle = '#ff5500';
    ctx.fillRect(w * 0.02, 90, 4, 4);
    ctx.fillRect(w * 0.94, 90, 4, 4);

    // Wide Rear LED Bar
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(w * 0.14, 122, w * 0.72, 4);

    canvas.refresh();
  }
  private generateGlowParticle(
    key: string,
    innerColor: string,
    midColor: string,
    outerColor: string,
    size: number = 32
  ): void {
    if (this.textures.exists(key)) return;

    const canvas = this.textures.createCanvas(key, size, size);
    if (!canvas) return;

    const ctx = canvas.getContext();
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.3, midColor);
    gradient.addColorStop(0.7, outerColor);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
  }

  /**
   * Large soft radial ambient glow texture for atmospheric lighting
   */
  private generateAmbientGlow(key: string, size: number = 128): void {
    if (this.textures.exists(key)) return;

    const canvas = this.textures.createCanvas(key, size, size);
    if (!canvas) return;

    const ctx = canvas.getContext();
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255, 100, 0, 0.6)');
    gradient.addColorStop(0.5, 'rgba(255, 30, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
  }

  /**
   * Horizontal speed streak texture with soft edge fades
   */
  private generateSpeedStreak(key: string, width: number, height: number): void {
    if (this.textures.exists(key)) return;

    const canvas = this.textures.createCanvas(key, width, height);
    if (!canvas) return;

    const ctx = canvas.getContext();
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, 'rgba(255, 80, 0, 0)');
    grad.addColorStop(0.2, 'rgba(255, 140, 40, 0.7)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.8, 'rgba(255, 140, 40, 0.7)');
    grad.addColorStop(1, 'rgba(255, 80, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    canvas.refresh();
  }
}
