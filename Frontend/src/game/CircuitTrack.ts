import Phaser from 'phaser';
import { TRACKS, type TrackConfig, type TrackPhysicsConfig, type TrackVisualConfig } from '../data/TrackData';
import { TrackGeometry, type TrackGeometryData, type Checkpoint, type GridSlot } from './TrackGeometry';
import { TrackEnvironment } from './TrackEnvironment';

export { type Checkpoint, type GridSlot } from './TrackGeometry';

export class CircuitTrack {
  public scene: Phaser.Scene;
  public trackConfig: TrackConfig;
  public geometry: TrackGeometryData;
  public environment: TrackEnvironment;

  // Geometry references
  public worldWidth: number;
  public worldHeight: number;
  public roadWidth: number;
  public waypoints: Phaser.Math.Vector2[];
  public trackPath: Phaser.Curves.Spline;
  public spacedPoints: Phaser.Math.Vector2[];
  public checkpoints: Checkpoint[];
  public startPosition: GridSlot;
  public startGridPositions: GridSlot[];

  // Physics & Visual Properties
  public physics: TrackPhysicsConfig;
  public visual: TrackVisualConfig;

  // Graphics layers
  public roadGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, trackConfig?: TrackConfig) {
    this.scene = scene;
    this.trackConfig = trackConfig || TRACKS[0];
    this.physics = this.trackConfig.physics;
    this.visual = this.trackConfig.visual;

    // Build circuit geometry
    this.geometry = TrackGeometry.getTrackGeometry(this.trackConfig.id);
    this.worldWidth = this.geometry.worldWidth;
    this.worldHeight = this.geometry.worldHeight;
    this.roadWidth = this.geometry.roadWidth;
    this.waypoints = this.geometry.waypoints;
    this.trackPath = this.geometry.trackPath;
    this.spacedPoints = this.geometry.spacedPoints;
    this.checkpoints = this.geometry.checkpoints;
    this.startPosition = this.geometry.startPosition;
    this.startGridPositions = this.geometry.startGridPositions;

    // Instantiate environment
    this.environment = new TrackEnvironment(scene, this.trackConfig, this.geometry);
  }

  /**
   * Renders the complete track environment, road surface, checkpoints, and starting grid
   */
  public renderTrack(): void {
    // 1. Terrain & Thematic Scenery
    this.environment.render();

    // 2. Road Surface & Markings Layer
    this.roadGraphics = this.scene.add.graphics().setDepth(1);
    this.drawRoad(this.roadGraphics);
    this.drawCheckpointGates(this.roadGraphics);
  }

  /**
   * Renders procedural road surface, checkered curbs, center line, and start grid
   */
  private drawRoad(g: Phaser.GameObjects.Graphics): void {
    const pts = this.spacedPoints;
    const len = pts.length;
    const halfRoad = this.roadWidth / 2;
    const vis = this.visual;

    // 1. Thematic Checkered Apex Curbs
    const curbExtra = 10;
    for (let i = 0; i < len; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % len];
      const isAlt = (Math.floor(i / 2) % 2) === 0;

      g.lineStyle(this.roadWidth + curbExtra * 2, isAlt ? vis.curbColor1 : vis.curbColor2, 0.95);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }

    // 2. Road Surface Base
    g.lineStyle(this.roadWidth, vis.roadColor, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < len; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath();
    g.strokePath();

    // 3. Inner Surface Highlight
    g.lineStyle(this.roadWidth - 10, vis.roadInnerColor, 1);
    g.strokePath();

    // 4. Glowing Neon Outer Road Edges
    for (let i = 0; i < len; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % len];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const rightX = -Math.sin(angle);
      const rightY = Math.cos(angle);

      const lx1 = p1.x - rightX * (halfRoad - 4);
      const ly1 = p1.y - rightY * (halfRoad - 4);
      const lx2 = p2.x - rightX * (halfRoad - 4);
      const ly2 = p2.y - rightY * (halfRoad - 4);

      const rx1 = p1.x + rightX * (halfRoad - 4);
      const ry1 = p1.y + rightY * (halfRoad - 4);
      const rx2 = p2.x + rightX * (halfRoad - 4);
      const ry2 = p2.y + rightY * (halfRoad - 4);

      g.lineStyle(3, vis.edgeGlowColor, 0.85);
      g.lineBetween(lx1, ly1, lx2, ly2);
      g.lineBetween(rx1, ry1, rx2, ry2);
    }

    // 5. Center Line Markings
    for (let i = 0; i < len; i += 2) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % len];
      g.lineStyle(3, vis.centerLineColor, 0.85);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }

    // 6. Checkered Start / Finish Line at CP 0
    const cp0 = this.checkpoints[0];
    const cpAngle = cp0.angle;
    const tanX = Math.cos(cpAngle);
    const tanY = Math.sin(cpAngle);
    const normX = -tanY;
    const normY = tanX;

    const checkW = 14;
    const numChecks = Math.floor(this.roadWidth / checkW);

    for (let c = 0; c < numChecks; c++) {
      const offset = -halfRoad + (c + 0.5) * checkW;
      const cx = cp0.x + normX * offset;
      const cy = cp0.y + normY * offset;
      const isAlt = c % 2 === 0;

      // Draw checkered quad behind start line
      g.fillStyle(isAlt ? 0xffffff : 0x000000, 1);
      g.fillCircle(cx - tanX * 6, cy - tanY * 6, checkW * 0.45);

      g.fillStyle(isAlt ? 0x000000 : 0xffffff, 1);
      g.fillCircle(cx + tanX * 6, cy + tanY * 6, checkW * 0.45);
    }

    // Start Line Neon Border
    const g1x = cp0.x - normX * halfRoad;
    const g1y = cp0.y - normY * halfRoad;
    const g2x = cp0.x + normX * halfRoad;
    const g2y = cp0.y + normY * halfRoad;

    g.lineStyle(3, 0xff5500, 1);
    g.lineBetween(g1x, g1y, g2x, g2y);

    // 7. Starting Grid Slots (P1, P2, P3, P4)
    this.startGridPositions.forEach((slot) => {
      const sAngle = slot.angle;
      const sTanX = Math.cos(sAngle);
      const sTanY = Math.sin(sAngle);
      const sNormX = -sTanY;
      const sNormY = sTanX;

      const halfBoxL = 28;
      const halfBoxW = 18;

      const pA = { x: slot.x - sTanX * halfBoxL - sNormX * halfBoxW, y: slot.y - sTanY * halfBoxL - sNormY * halfBoxW };
      const pB = { x: slot.x + sTanX * halfBoxL - sNormX * halfBoxW, y: slot.y + sTanY * halfBoxL - sNormY * halfBoxW };
      const pC = { x: slot.x + sTanX * halfBoxL + sNormX * halfBoxW, y: slot.y + sTanY * halfBoxL + sNormY * halfBoxW };
      const pD = { x: slot.x - sTanX * halfBoxL + sNormX * halfBoxW, y: slot.y - sTanY * halfBoxL + sNormY * halfBoxW };

      g.lineStyle(2, 0xffaa00, 0.85);
      g.beginPath();
      g.moveTo(pA.x, pA.y);
      g.lineTo(pB.x, pB.y);
      g.lineTo(pC.x, pC.y);
      g.lineTo(pD.x, pD.y);
      g.closePath();
      g.strokePath();

      // Front pole marker
      g.lineBetween(pB.x, pB.y, pB.x + sTanX * 10, pB.y + sTanY * 10);
    });

    // 8. Overhead Start Gantry Towers
    const gantryX1 = cp0.x - normX * (halfRoad + 16);
    const gantryY1 = cp0.y - normY * (halfRoad + 16);
    const gantryX2 = cp0.x + normX * (halfRoad + 16);
    const gantryY2 = cp0.y + normY * (halfRoad + 16);

    g.fillStyle(0x0f172a, 1);
    g.fillCircle(gantryX1, gantryY1, 14);
    g.fillCircle(gantryX2, gantryY2, 14);

    g.lineStyle(2, 0xff5500, 1);
    g.strokeCircle(gantryX1, gantryY1, 14);
    g.strokeCircle(gantryX2, gantryY2, 14);

    g.lineStyle(6, 0x0a1020, 0.95);
    g.lineBetween(gantryX1, gantryY1, gantryX2, gantryY2);

    g.lineStyle(2.5, 0xff5500, 1);
    g.lineBetween(gantryX1, gantryY1, gantryX2, gantryY2);
  }

  /**
   * Renders visual holographic checkpoint gates along the circuit
   */
  private drawCheckpointGates(g: Phaser.GameObjects.Graphics): void {
    const halfRoad = this.roadWidth / 2;

    for (let i = 1; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      const normalX = -Math.sin(cp.angle);
      const normalY = Math.cos(cp.angle);

      const x1 = cp.x - normalX * (halfRoad + 6);
      const y1 = cp.y - normalY * (halfRoad + 6);
      const x2 = cp.x + normalX * (halfRoad + 6);
      const y2 = cp.y + normalY * (halfRoad + 6);

      // Translucent cyan beam line across track
      g.lineStyle(2, this.visual.edgeGlowColor, 0.45);
      g.lineBetween(x1, y1, x2, y2);

      // Gate border pylons on curbs
      g.fillStyle(0x0a1020, 1);
      g.fillCircle(x1, y1, 7);
      g.fillCircle(x2, y2, 7);

      g.lineStyle(2, this.visual.edgeGlowColor, 0.9);
      g.strokeCircle(x1, y1, 7);
      g.strokeCircle(x2, y2, 7);

      // Glowing core
      g.fillStyle(this.visual.edgeGlowColor, 1);
      g.fillCircle(x1, y1, 3.5);
      g.fillCircle(x2, y2, 3.5);
    }
  }

  /**
   * Distance from any world coordinate to the nearest track centerline
   */
  public getDistanceToTrackCenter(x: number, y: number): number {
    let minSq = Infinity;
    const pts = this.spacedPoints;
    const len = pts.length;
    for (let i = 0; i < len; i += 2) {
      const p = pts[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const sq = dx * dx + dy * dy;
      if (sq < minSq) {
        minSq = sq;
      }
    }
    return Math.sqrt(minSq);
  }

  /**
   * Checks whether a point is currently on the track surface
   */
  public isPointOnTrack(x: number, y: number): boolean {
    return this.getDistanceToTrackCenter(x, y) <= this.roadWidth * 0.58;
  }

  /**
   * Updates environmental animation
   */
  public update(dt: number): void {
    this.environment.update(dt);
  }

  /**
   * Backwards-compatible alias for update
   */
  public updateWaves(dt: number): void {
    this.update(dt);
  }

  public destroy(): void {
    this.environment.destroy();
    this.roadGraphics?.destroy();
  }
}
