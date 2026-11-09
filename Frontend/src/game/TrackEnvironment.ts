import Phaser from 'phaser';
import type { TrackConfig } from '../data/TrackData';
import type { TrackGeometryData } from './TrackGeometry';

export class TrackEnvironment {
  private scene: Phaser.Scene;
  private trackConfig: TrackConfig;
  private geometry: TrackGeometryData;

  // Graphics layers
  public terrainGraphics!: Phaser.GameObjects.Graphics;
  public sceneryGraphics!: Phaser.GameObjects.Graphics;
  public animatedGraphics?: Phaser.GameObjects.Graphics;

  // Animation timers
  private animTimer: number = 0;

  constructor(scene: Phaser.Scene, trackConfig: TrackConfig, geometry: TrackGeometryData) {
    this.scene = scene;
    this.trackConfig = trackConfig;
    this.geometry = geometry;
  }

  /**
   * Renders the complete environment terrain and roadside thematic scenery
   */
  public render(): void {
    const depthTerrain = 0;
    const depthScenery = 3;
    const depthAnimated = 4;

    this.terrainGraphics = this.scene.add.graphics().setDepth(depthTerrain);
    this.drawTerrain(this.terrainGraphics);

    this.sceneryGraphics = this.scene.add.graphics().setDepth(depthScenery);
    this.drawScenery(this.sceneryGraphics);

    this.animatedGraphics = this.scene.add.graphics().setDepth(depthAnimated);
  }

  /**
   * Main per-frame update for environmental animations
   */
  public update(dt: number): void {
    this.animTimer += dt;
    if (!this.animatedGraphics) return;

    const g = this.animatedGraphics;
    g.clear();

    switch (this.trackConfig.terrainType) {
      case 'coastal':
        this.updateOceanWaves(g);
        break;
      case 'volcano':
        this.updateVolcanoLava(g);
        break;
      case 'snow':
        this.updateBlizzardFlurry(g);
        break;
      case 'city':
        this.updateCityNeon(g);
        break;
      case 'space':
        this.updateSpaceEnergy(g);
        break;
      default:
        break;
    }
  }

  /**
   * Renders the base thematic terrain background
   */
  private drawTerrain(g: Phaser.GameObjects.Graphics): void {
    const W = this.geometry.worldWidth;
    const H = this.geometry.worldHeight;

    switch (this.trackConfig.terrainType) {
      case 'coastal':
        // Deep grass base with ocean along south & east coast
        g.fillStyle(0x1a3328, 1);
        g.fillRect(0, 0, W, H);

        // Sandy beaches
        g.fillStyle(0xd4a373, 1);
        g.beginPath();
        g.moveTo(0, H - 450);
        g.lineTo(W * 0.3, H - 470);
        g.lineTo(W * 0.6, H - 430);
        g.lineTo(W - 200, H * 0.65);
        g.lineTo(W, H * 0.45);
        g.lineTo(W, H);
        g.lineTo(0, H);
        g.closePath();
        g.fillPath();

        // Ocean waters
        g.fillStyle(0x023e8a, 1);
        g.beginPath();
        g.moveTo(0, H - 280);
        g.lineTo(W * 0.3, H - 300);
        g.lineTo(W * 0.6, H - 260);
        g.lineTo(W - 120, H * 0.72);
        g.lineTo(W, H * 0.55);
        g.lineTo(W, H);
        g.lineTo(0, H);
        g.closePath();
        g.fillPath();

        // Rocky bluffs in infield
        g.fillStyle(0x2d3748, 0.9);
        g.fillCircle(1300, 1100, 240);
        g.fillCircle(1550, 1200, 180);
        break;

      case 'city':
        // Dark cyberpunk urban asphalt foundation
        g.fillStyle(0x0a0f1d, 1);
        g.fillRect(0, 0, W, H);

        // City block grid lines
        g.lineStyle(1, 0x1e293b, 0.6);
        for (let x = 0; x < W; x += 180) {
          g.lineBetween(x, 0, x, H);
        }
        for (let y = 0; y < H; y += 180) {
          g.lineBetween(0, y, W, y);
        }

        // Skyscraper building footprint blocks
        g.fillStyle(0x11192e, 0.95);
        for (let bx = 100; bx < W - 200; bx += 260) {
          for (let by = 100; by < H - 200; by += 240) {
            if (this.geometry.spacedPoints.every((p) => Math.hypot(p.x - (bx + 80), p.y - (by + 70)) > 150)) {
              g.fillRect(bx, by, 160, 140);
              g.lineStyle(1.5, 0x00f0ff, 0.3);
              g.strokeRect(bx, by, 160, 140);
            }
          }
        }
        break;

      case 'mountain':
        // Alpine rock & granite terrain
        g.fillStyle(0x1f242d, 1);
        g.fillRect(0, 0, W, H);

        // Mountain rock ridges
        g.fillStyle(0x2a3342, 0.85);
        g.fillCircle(1600, 1200, 420);
        g.fillCircle(1200, 900, 320);
        g.fillCircle(2000, 1400, 280);
        g.fillCircle(800, 1500, 260);

        // Jagged mountain contour lines
        g.lineStyle(2, 0x475569, 0.4);
        for (let r = 100; r < 500; r += 80) {
          g.strokeCircle(1600, 1200, r);
        }
        break;

      case 'desert':
        // Expansive warm canyon sand
        g.fillStyle(0xc27a38, 1);
        g.fillRect(0, 0, W, H);

        // Wavy sand dune ridges
        g.fillStyle(0xa66025, 0.7);
        for (let dy = 200; dy < H; dy += 350) {
          g.beginPath();
          g.moveTo(0, dy);
          g.lineTo(W * 0.25, dy - 60);
          g.lineTo(W * 0.50, dy + 50);
          g.lineTo(W * 0.75, dy - 40);
          g.lineTo(W, dy + 20);
          g.lineTo(W, dy + 160);
          g.lineTo(W * 0.75, dy + 120);
          g.lineTo(W * 0.50, dy + 180);
          g.lineTo(W * 0.25, dy + 100);
          g.lineTo(0, dy + 140);
          g.closePath();
          g.fillPath();
        }

        // Salt flats infield basin
        g.fillStyle(0xe2d5c3, 0.75);
        g.fillCircle(1700, 1200, 360);
        break;

      case 'forest':
        // Deep mossy forest loam
        g.fillStyle(0x0f291e, 1);
        g.fillRect(0, 0, W, H);

        // River stream winding through the forest
        g.fillStyle(0x0284c7, 0.85);
        g.beginPath();
        g.moveTo(0, 700);
        g.lineTo(W * 0.25, 780);
        g.lineTo(W * 0.50, 720);
        g.lineTo(W * 0.75, 820);
        g.lineTo(W, 760);
        g.lineTo(W, 900);
        g.lineTo(W * 0.75, 960);
        g.lineTo(W * 0.50, 860);
        g.lineTo(W * 0.25, 920);
        g.lineTo(0, 840);
        g.closePath();
        g.fillPath();
        break;

      case 'snow':
        // Pristine frozen snowfield
        g.fillStyle(0xdbeafe, 1);
        g.fillRect(0, 0, W, H);

        // Glacial frozen ice sheet across the center
        g.fillStyle(0x93c5fd, 0.85);
        g.fillCircle(1700, 1200, 480);
        g.fillCircle(1300, 950, 340);
        g.fillCircle(2100, 1350, 320);

        // Ice sheet cracks
        g.lineStyle(1.5, 0xffffff, 0.7);
        g.lineBetween(1400, 1000, 1750, 1250);
        g.lineBetween(1750, 1250, 2050, 1150);
        g.lineBetween(1750, 1250, 1800, 1500);
        break;

      case 'volcano':
        // Dark volcanic ash and basalt bedrock
        g.fillStyle(0x181014, 1);
        g.fillRect(0, 0, W, H);

        // Glowing magma crater in infield
        g.fillStyle(0x7f1d1d, 0.9);
        g.fillCircle(1700, 1200, 420);
        g.fillStyle(0xb91c1c, 0.95);
        g.fillCircle(1700, 1200, 320);
        g.fillStyle(0xf97316, 1);
        g.fillCircle(1700, 1200, 180);

        // Radiating lava rivers
        g.lineStyle(24, 0xef4444, 0.8);
        g.beginPath();
        g.moveTo(1700, 1200);
        g.lineTo(W - 200, 400);
        g.moveTo(1700, 1200);
        g.lineTo(300, H - 300);
        g.strokePath();
        break;

      case 'rural':
        // Rolling green pastoral meadows
        g.fillStyle(0x274e13, 1);
        g.fillRect(0, 0, W, H);

        // Golden wheat farmland patches
        g.fillStyle(0xca8a04, 0.65);
        g.fillRect(200, 200, 550, 400);
        g.fillRect(W - 850, 300, 600, 450);
        g.fillRect(W - 900, H - 750, 650, 500);
        g.fillRect(300, H - 750, 500, 450);

        // Cobblestone country brook
        g.fillStyle(0x0284c7, 0.8);
        g.beginPath();
        g.moveTo(1100, 0);
        g.lineTo(1300, H);
        g.lineTo(1360, H);
        g.lineTo(1160, 0);
        g.closePath();
        g.fillPath();
        break;

      case 'space':
        // Deep cosmic starfield
        g.fillStyle(0x050711, 1);
        g.fillRect(0, 0, W, H);

        // Distant nebula gas clouds
        g.fillStyle(0x3b0764, 0.45);
        g.fillCircle(W * 0.25, H * 0.35, 450);
        g.fillStyle(0x0c4a6e, 0.35);
        g.fillCircle(W * 0.75, H * 0.65, 520);

        // Metallic orbital station platform trusses
        g.lineStyle(2, 0x38bdf8, 0.25);
        for (let x = 0; x < W; x += 150) {
          g.lineBetween(x, 0, x + 300, H);
          g.lineBetween(x + 300, 0, x, H);
        }
        break;
    }
  }

  /**
   * Renders static roadside thematic scenery objects
   */
  private drawScenery(g: Phaser.GameObjects.Graphics): void {
    const pts = this.geometry.spacedPoints;
    const len = pts.length;
    const halfRoad = this.geometry.roadWidth / 2;

    switch (this.trackConfig.terrainType) {
      case 'coastal':
        // Palm trees along outer margins
        for (let i = 0; i < len; i += 12) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          // Place trees on both sides
          const tx = p.x + normX * (halfRoad + 65);
          const ty = p.y + normY * (halfRoad + 65);
          this.drawPalmTree(g, tx, ty);
        }
        break;

      case 'city':
        // Street lights and neon billboards
        for (let i = 0; i < len; i += 10) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const lx = p.x + normX * (halfRoad + 35);
          const ly = p.y + normY * (halfRoad + 35);

          // Street lamp base
          g.fillStyle(0x0f172a, 1);
          g.fillCircle(lx, ly, 6);
          g.fillStyle(0x00f0ff, 1);
          g.fillCircle(lx, ly, 3);
          g.lineStyle(1.5, 0xff007f, 0.8);
          g.strokeCircle(lx, ly, 7);
        }
        break;

      case 'mountain':
        // Pine trees and rock boulders
        for (let i = 0; i < len; i += 11) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const px = p.x - normX * (halfRoad + 55);
          const py = p.y - normY * (halfRoad + 55);
          this.drawPineTree(g, px, py);

          const rx = p.x + normX * (halfRoad + 45);
          const ry = p.y + normY * (halfRoad + 45);
          this.drawBoulder(g, rx, ry);
        }
        break;

      case 'desert':
        // Saguaro cacti and sandstone pillars
        for (let i = 0; i < len; i += 14) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const cx = p.x + normX * (halfRoad + 60);
          const cy = p.y + normY * (halfRoad + 60);
          this.drawCactus(g, cx, cy);
        }
        break;

      case 'forest':
        // Giant Redwood trees
        for (let i = 0; i < len; i += 10) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const rx1 = p.x + normX * (halfRoad + 60);
          const ry1 = p.y + normY * (halfRoad + 60);
          this.drawRedwoodTree(g, rx1, ry1);

          const rx2 = p.x - normX * (halfRoad + 60);
          const ry2 = p.y - normY * (halfRoad + 60);
          this.drawRedwoodTree(g, rx2, ry2);
        }
        break;

      case 'snow':
        // Snow-covered firs and ice beacons
        for (let i = 0; i < len; i += 12) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const sx = p.x + normX * (halfRoad + 55);
          const sy = p.y + normY * (halfRoad + 55);
          this.drawSnowFir(g, sx, sy);
        }
        break;

      case 'volcano':
        // Obsidian shards and warning beacons
        for (let i = 0; i < len; i += 12) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const vx = p.x + normX * (halfRoad + 45);
          const vy = p.y + normY * (halfRoad + 45);
          g.fillStyle(0x450a0a, 1);
          g.fillCircle(vx, vy, 12);
          g.fillStyle(0xef4444, 1);
          g.fillCircle(vx, vy, 5);
          g.lineStyle(1.5, 0xffaa00, 0.9);
          g.strokeCircle(vx, vy, 14);
        }
        break;

      case 'rural':
        // Farm fences and oak trees
        for (let i = 0; i < len; i += 12) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const ox = p.x + normX * (halfRoad + 65);
          const oy = p.y + normY * (halfRoad + 65);
          this.drawOakTree(g, ox, oy);
        }
        break;

      case 'space':
        // Magnetic energy pylons along track rim
        for (let i = 0; i < len; i += 8) {
          const p = pts[i];
          const next = pts[(i + 1) % len];
          const angle = Math.atan2(next.y - p.y, next.x - p.x);
          const normX = -Math.sin(angle);
          const normY = Math.cos(angle);

          const px1 = p.x + normX * (halfRoad + 28);
          const py1 = p.y + normY * (halfRoad + 28);
          const px2 = p.x - normX * (halfRoad + 28);
          const py2 = p.y - normY * (halfRoad + 28);

          g.fillStyle(0x1e1b4b, 1);
          g.fillRect(px1 - 6, py1 - 6, 12, 12);
          g.fillRect(px2 - 6, py2 - 6, 12, 12);

          g.fillStyle(0x00f0ff, 1);
          g.fillCircle(px1, py1, 3.5);
          g.fillCircle(px2, py2, 3.5);

          g.lineStyle(1.5, 0xa855f7, 0.9);
          g.strokeRect(px1 - 6, py1 - 6, 12, 12);
          g.strokeRect(px2 - 6, py2 - 6, 12, 12);
        }
        break;
    }
  }

  // Helper Scenery Drawers
  private drawPalmTree(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x78350f, 1);
    g.fillCircle(x, y, 6);
    g.fillStyle(0x15803d, 0.9);
    for (let f = 0; f < 6; f++) {
      const fa = (f / 6) * Math.PI * 2;
      g.fillCircle(x + Math.cos(fa) * 22, y + Math.sin(fa) * 22, 11);
    }
    g.fillStyle(0x22c55e, 1);
    g.fillCircle(x, y, 9);
  }

  private drawPineTree(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x451a03, 1);
    g.fillCircle(x, y, 5);
    g.fillStyle(0x064e3b, 0.95);
    g.fillCircle(x, y, 22);
    g.fillStyle(0x047857, 1);
    g.fillCircle(x, y, 15);
  }

  private drawBoulder(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x334155, 1);
    g.fillCircle(x, y, 14);
    g.fillStyle(0x64748b, 0.9);
    g.fillCircle(x - 3, y - 3, 10);
  }

  private drawCactus(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x166534, 1);
    g.fillCircle(x, y, 10);
    g.fillCircle(x - 12, y, 6);
    g.fillCircle(x + 12, y, 6);
    g.fillStyle(0x4ade80, 0.85);
    g.fillCircle(x, y, 5);
  }

  private drawRedwoodTree(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x7f1d1d, 1);
    g.fillCircle(x, y, 14);
    g.fillStyle(0x14532d, 0.9);
    g.fillCircle(x, y, 32);
    g.fillStyle(0x16a34a, 1);
    g.fillCircle(x, y, 20);
  }

  private drawSnowFir(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x1e3a8a, 1);
    g.fillCircle(x, y, 5);
    g.fillStyle(0x0f766e, 0.9);
    g.fillCircle(x, y, 20);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(x, y, 13);
  }

  private drawOakTree(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x713f12, 1);
    g.fillCircle(x, y, 7);
    g.fillStyle(0x15803d, 0.9);
    g.fillCircle(x, y, 24);
    g.fillStyle(0x65a30d, 1);
    g.fillCircle(x, y, 16);
  }

  // Animation Update Handlers
  private updateOceanWaves(g: Phaser.GameObjects.Graphics): void {
    const W = this.geometry.worldWidth;
    const H = this.geometry.worldHeight;
    g.lineStyle(2.5, 0xffffff, 0.4);

    for (let w = 0; w < 4; w++) {
      const waveOffset = Math.sin(this.animTimer * 2 + w * 1.5) * 8;
      const baseY = H - 240 + w * 55 + waveOffset;

      g.beginPath();
      g.moveTo(0, baseY);
      for (let x = 0; x < W * 0.8; x += 120) {
        const wy = baseY + Math.sin(x * 0.01 + this.animTimer * 2 + w) * 6;
        g.lineTo(x, wy);
      }
      g.strokePath();
    }
  }

  private updateVolcanoLava(g: Phaser.GameObjects.Graphics): void {
    const pulse = 0.5 + Math.sin(this.animTimer * 3.5) * 0.3;
    g.fillStyle(0xff5500, pulse);
    g.fillCircle(1700, 1200, 210);
    g.fillStyle(0xfde047, pulse * 0.8);
    g.fillCircle(1700, 1200, 110);
  }

  private updateBlizzardFlurry(g: Phaser.GameObjects.Graphics): void {
    const W = this.geometry.worldWidth;
    const H = this.geometry.worldHeight;
    g.fillStyle(0xffffff, 0.6);

    for (let f = 0; f < 30; f++) {
      const fx = (Math.sin(this.animTimer + f) * 0.5 + 0.5) * W;
      const fy = ((this.animTimer * 180 + f * 90) % H);
      g.fillCircle(fx, fy, 2.5);
    }
  }

  private updateCityNeon(g: Phaser.GameObjects.Graphics): void {
    const pulse = 0.6 + Math.sin(this.animTimer * 5) * 0.4;
    g.lineStyle(2, 0xff007f, pulse);
    const p = this.geometry.spacedPoints[30];
    if (p) g.strokeCircle(p.x, p.y, 40);
  }

  private updateSpaceEnergy(g: Phaser.GameObjects.Graphics): void {
    const pulse = 0.5 + Math.sin(this.animTimer * 4) * 0.3;
    g.lineStyle(2, 0x00f0ff, pulse);
    const p = this.geometry.spacedPoints[40];
    if (p) g.strokeCircle(p.x, p.y, 48);
  }

  public destroy(): void {
    this.terrainGraphics?.destroy();
    this.sceneryGraphics?.destroy();
    this.animatedGraphics?.destroy();
  }
}
