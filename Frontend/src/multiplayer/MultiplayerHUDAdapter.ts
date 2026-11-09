/**
 * Nitro Rush — Multiplayer HUD Adapter
 *
 * Drives the 8-racer multiplayer in-race HUD:
 * - 8-competitor live standings with rank ordering, driver names, slot badges, and local highlight.
 * - Lap & telemetry center panel (LAP X / 3, split timers, checkpoint notifications).
 * - Digital speedometer arc, gear indicator, and horizontal nitro bar.
 * - Vector minimap rendering track outline with live pips for all 8 racers.
 * - Center banners for countdown (3-2-1-GO) and race finish.
 */

import Phaser from 'phaser';
import type { CircuitTrack } from '../game/CircuitTrack';
import { formatLapTime } from '../game/RaceManager';

export interface CompetitorHUDItem {
  id: string;
  name: string;
  slot: string;
  pos: number;
  lap: number;
  status: string;
  carId: string;
}

export class MultiplayerHUDAdapter {
  private scene: Phaser.Scene;
  public container: Phaser.GameObjects.Container;

  // Standings
  private leaderboardContainer: Phaser.GameObjects.Container;
  private playerPosBadgeText: Phaser.GameObjects.Text;
  private leaderboardRows: {
    bg: Phaser.GameObjects.Graphics;
    posText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
    lapText: Phaser.GameObjects.Text;
  }[] = [];

  // Telemetry Panel
  public lapCounterText!: Phaser.GameObjects.Text;
  public currentLapTimerText!: Phaser.GameObjects.Text;
  public totalRaceTimerText!: Phaser.GameObjects.Text;

  // Speedometer Cluster
  private speedNumberText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private speedArcGraphics!: Phaser.GameObjects.Graphics;
  private nitroFillGraphics!: Phaser.GameObjects.Graphics;
  private nitroPercentText!: Phaser.GameObjects.Text;

  // Vector Minimap
  private minimapContainer!: Phaser.GameObjects.Container;
  private minimapPipsGraphics!: Phaser.GameObjects.Graphics;
  private minimapScale: number = 1;
  private minimapOffsetX: number = 0;
  private minimapOffsetY: number = 0;

  // Announcements
  public announcementText!: Phaser.GameObjects.Text;
  private checkpointNoticeText!: Phaser.GameObjects.Text;

  // Timers
  private raceElapsedTimeMs: number = 0;
  private isRaceActive: boolean = false;

  constructor(scene: Phaser.Scene, track: CircuitTrack) {
    this.scene = scene;
    const { width, height } = scene.scale;

    this.container = scene.add.container(0, 0).setDepth(200).setScrollFactor(0);

    // 1. Live Standings Container (Top Left, 8 slots)
    const lbW = 220;
    const lbH = 210;
    const lbX = 20;
    const lbY = 20;

    this.leaderboardContainer = scene.add.container(lbX, lbY);
    const lbBg = scene.add.graphics();
    lbBg.fillStyle(0x0a1020, 0.88);
    lbBg.fillRoundedRect(0, 0, lbW, lbH, 6);
    lbBg.lineStyle(1.5, 0x00f0ff, 0.5);
    lbBg.strokeRoundedRect(0, 0, lbW, lbH, 6);
    this.leaderboardContainer.add(lbBg);

    const lbTitle = scene.add.text(12, 8, 'LIVE STANDINGS', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#94a3b8',
      fontStyle: 'bold',
      letterSpacing: 1,
    });

    this.playerPosBadgeText = scene.add.text(lbW - 12, 6, 'POS: 1 / 8', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '15px',
      color: '#ffaa00',
      letterSpacing: 1,
    }).setOrigin(1, 0);

    this.leaderboardContainer.add([lbTitle, this.playerPosBadgeText]);

    // 8 Leaderboard Rows
    const rowStartY = 28;
    const rowH = 21;

    for (let r = 0; r < 8; r++) {
      const ry = rowStartY + r * rowH;
      const rowBg = scene.add.graphics();
      this.leaderboardContainer.add(rowBg);

      const posText = scene.add.text(12, ry + 2, `${r + 1}`, {
        fontFamily: '"Impact", "Segoe UI", sans-serif',
        fontSize: '12px',
        color: '#94a3b8',
      });

      const nameText = scene.add.text(32, ry + 3, '---', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      });

      const lapText = scene.add.text(lbW - 12, ry + 3, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#00f0ff',
      }).setOrigin(1, 0);

      this.leaderboardContainer.add([posText, nameText, lapText]);
      this.leaderboardRows.push({ bg: rowBg, posText, nameText, lapText });
    }
    this.container.add(this.leaderboardContainer);

    // 2. Lap & Telemetry Center Panel
    const panelW = 460;
    const panelH = 58;
    const panelX = width / 2;
    const panelY = 40;

    const telemetryPanel = scene.add.container(panelX, panelY);
    const telBg = scene.add.graphics();
    telBg.fillStyle(0x0a1020, 0.92);
    telBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 6);
    telBg.lineStyle(1.5, 0x00f0ff, 0.6);
    telBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 6);
    telemetryPanel.add(telBg);

    this.lapCounterText = scene.add.text(-panelW / 2 + 16, -12, 'LAP 1 / 3', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '22px',
      color: '#00f0ff',
      letterSpacing: 1,
    });

    this.currentLapTimerText = scene.add.text(0, -10, 'TIME: 00:00.000', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.totalRaceTimerText = scene.add.text(panelW / 2 - 16, -10, 'ONLINE (20Hz)', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#10b981',
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.checkpointNoticeText = scene.add.text(0, 10, 'MULTIPLAYER // GRID AUTHORITATIVE', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#94a3b8',
    }).setOrigin(0.5, 0);

    telemetryPanel.add([
      this.lapCounterText,
      this.currentLapTimerText,
      this.totalRaceTimerText,
      this.checkpointNoticeText,
    ]);
    this.container.add(telemetryPanel);

    // 3. Digital Speedometer & Nitro Cluster (Bottom Right)
    const clusterX = width - 170;
    const clusterY = height - 90;

    const clusterBg = scene.add.graphics();
    clusterBg.fillStyle(0x0a1020, 0.92);
    clusterBg.fillRoundedRect(clusterX - 25, clusterY - 25, 180, 105, 6);
    clusterBg.lineStyle(1.5, 0x00f0ff, 0.6);
    clusterBg.strokeRoundedRect(clusterX - 25, clusterY - 25, 180, 105, 6);
    this.container.add(clusterBg);

    this.speedArcGraphics = scene.add.graphics();
    this.container.add(this.speedArcGraphics);

    this.speedNumberText = scene.add.text(clusterX + 50, clusterY + 10, '0', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '38px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const kmhLabel = scene.add.text(clusterX + 50, clusterY + 34, 'KM / H', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#94a3b8',
      letterSpacing: 1.5,
    }).setOrigin(0.5);

    this.gearText = scene.add.text(clusterX - 5, clusterY + 10, 'N', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '20px',
      color: '#00f0ff',
    }).setOrigin(0.5);

    this.container.add([this.speedNumberText, kmhLabel, this.gearText]);

    // Nitro Gauge Bar
    const nitroTrack = scene.add.graphics();
    nitroTrack.fillStyle(0x0f172a, 1);
    nitroTrack.fillRoundedRect(clusterX - 15, clusterY + 54, 150, 12, 2);
    this.container.add(nitroTrack);

    this.nitroFillGraphics = scene.add.graphics();
    this.container.add(this.nitroFillGraphics);

    this.nitroPercentText = scene.add.text(clusterX + 60, clusterY + 60, 'NITRO 100%', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(this.nitroPercentText);

    // 4. Vector Minimap (Top Right)
    this.createMinimap(width, track);

    // 5. Center Announcement Text
    this.announcementText = scene.add.text(width / 2, height / 2 - 20, '', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '76px',
      color: '#ff3300',
      stroke: '#050811',
      strokeThickness: 10,
      fontStyle: 'italic',
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0);
    this.container.add(this.announcementText);
  }

  private createMinimap(screenWidth: number, track: CircuitTrack): void {
    const mapW = 160;
    const mapH = 120;
    const mapX = screenWidth - mapW - 20;
    const mapY = 20;

    this.minimapContainer = this.scene.add.container(mapX, mapY);

    const mapBg = this.scene.add.graphics();
    mapBg.fillStyle(0x0a1020, 0.85);
    mapBg.fillRoundedRect(0, 0, mapW, mapH, 6);
    mapBg.lineStyle(1, 0x1e293b, 0.8);
    mapBg.strokeRoundedRect(0, 0, mapW, mapH, 6);
    this.minimapContainer.add(mapBg);

    // Scale track points to fit minimap box
    const margin = 14;
    const availW = mapW - margin * 2;
    const availH = mapH - margin * 2;

    this.minimapScale = Math.min(availW / track.worldWidth, availH / track.worldHeight);
    this.minimapOffsetX = margin + (availW - track.worldWidth * this.minimapScale) / 2;
    this.minimapOffsetY = margin + (availH - track.worldHeight * this.minimapScale) / 2;

    const trackLine = this.scene.add.graphics();
    trackLine.lineStyle(2, 0x00f0ff, 0.45);
    trackLine.beginPath();

    const pts = track.spacedPoints;
    if (pts.length > 0) {
      trackLine.moveTo(
        this.minimapOffsetX + pts[0].x * this.minimapScale,
        this.minimapOffsetY + pts[0].y * this.minimapScale
      );
      for (let i = 1; i < pts.length; i++) {
        trackLine.lineTo(
          this.minimapOffsetX + pts[i].x * this.minimapScale,
          this.minimapOffsetY + pts[i].y * this.minimapScale
        );
      }
      trackLine.closePath();
      trackLine.strokePath();
    }
    this.minimapContainer.add(trackLine);

    this.minimapPipsGraphics = this.scene.add.graphics();
    this.minimapContainer.add(this.minimapPipsGraphics);

    this.container.add(this.minimapContainer);
  }

  public startRaceTimer(): void {
    this.isRaceActive = true;
    this.raceElapsedTimeMs = 0;
  }

  public update(dt: number, speedKMH: number, nitro: number, isReversing: boolean): void {
    if (this.isRaceActive) {
      this.raceElapsedTimeMs += dt * 1000;
      this.currentLapTimerText.setText(`TIME: ${formatLapTime(this.raceElapsedTimeMs)}`);
    }

    // Speedometer & Gear
    this.speedNumberText.setText(String(Math.max(0, speedKMH)));
    this.gearText.setText(isReversing ? 'R' : speedKMH < 5 ? 'N' : String(Math.min(6, Math.floor(speedKMH / 50) + 1)));

    // Nitro Bar
    const clusterX = this.scene.scale.width - 170;
    const clusterY = this.scene.scale.height - 90;
    const nitroRatio = Math.max(0, Math.min(1, nitro / 100));

    this.nitroFillGraphics.clear();
    this.nitroFillGraphics.fillStyle(0x00f0ff, 0.95);
    this.nitroFillGraphics.fillRoundedRect(clusterX - 15, clusterY + 54, 150 * nitroRatio, 12, 2);
    this.nitroPercentText.setText(`NITRO ${Math.round(nitro)}%`);
  }

  /**
   * Updates 8-competitor live standings from authoritative server telemetry.
   */
  public updateAuthoritativeStandings(
    localPlayerId: string,
    competitors: CompetitorHUDItem[]
  ): void {
    // Sort competitors by authoritative server position
    const sorted = [...competitors].sort((a, b) => a.pos - b.pos);
    const totalRacers = sorted.length;

    const localCompetitor = sorted.find((c) => c.id === localPlayerId);
    if (localCompetitor) {
      this.playerPosBadgeText.setText(`POS: ${localCompetitor.pos} / ${totalRacers}`);
      this.lapCounterText.setText(`LAP ${localCompetitor.lap} / 3`);
    }

    for (let i = 0; i < 8; i++) {
      const row = this.leaderboardRows[i];
      if (i < sorted.length) {
        const c = sorted[i];
        const isLocal = c.id === localPlayerId;

        row.bg.clear();
        if (isLocal) {
          row.bg.fillStyle(0x00f0ff, 0.22);
          row.bg.fillRoundedRect(4, 28 + i * 21, 212, 19, 3);
        }

        row.posText.setText(String(c.pos)).setColor(isLocal ? '#00f0ff' : '#94a3b8');
        row.nameText.setText(`[${c.slot}] ${c.name}`).setColor(isLocal ? '#ffffff' : '#cbd5e1');

        if (c.status === 'FINISHED') {
          row.lapText.setText('FIN').setColor('#10b981');
        } else if (c.status === 'DNF') {
          row.lapText.setText('DNF').setColor('#ef4444');
        } else if (c.status === 'DISCONNECTED') {
          row.lapText.setText('DISC').setColor('#f59e0b');
        } else {
          row.lapText.setText(`L${c.lap}`).setColor('#00f0ff');
        }
      } else {
        row.bg.clear();
        row.posText.setText('');
        row.nameText.setText('');
        row.lapText.setText('');
      }
    }
  }

  /**
   * Updates vector minimap pips for all vehicles.
   */
  public updateMinimap(
    localX: number,
    localY: number,
    remotePositions: { id: string; x: number; y: number; color?: number }[]
  ): void {
    this.minimapPipsGraphics.clear();

    // Remote competitor pips (radius 3.5)
    for (const remote of remotePositions) {
      const mx = this.minimapOffsetX + remote.x * this.minimapScale;
      const my = this.minimapOffsetY + remote.y * this.minimapScale;
      this.minimapPipsGraphics.fillStyle(remote.color || 0xf59e0b, 0.95);
      this.minimapPipsGraphics.fillCircle(mx, my, 3.5);
    }

    // Local player pip (radius 4.5, neon cyan/gold)
    const lx = this.minimapOffsetX + localX * this.minimapScale;
    const ly = this.minimapOffsetY + localY * this.minimapScale;
    this.minimapPipsGraphics.fillStyle(0x00f0ff, 1);
    this.minimapPipsGraphics.fillCircle(lx, ly, 4.5);
    this.minimapPipsGraphics.lineStyle(1.5, 0xffffff, 1);
    this.minimapPipsGraphics.strokeCircle(lx, ly, 4.5);
  }

  public showCheckpointFlash(cpIndex: number): void {
    this.checkpointNoticeText.setText(`CHECKPOINT ${cpIndex + 1} // CLEARED`).setColor('#10b981');
    this.scene.time.delayedCall(1200, () => {
      this.checkpointNoticeText.setText('MULTIPLAYER // GRID AUTHORITATIVE').setColor('#94a3b8');
    });
  }

  public showFinishBanner(position: number, totalRacers: number): void {
    const isFirst = position === 1;
    const banner = isFirst ? '🏁 VICTORY! 1ST PLACE 🏁' : `🏁 FINISHED! POS: ${position} / ${totalRacers} 🏁`;
    this.announcementText.setText(banner).setColor(isFirst ? '#ffaa00' : '#10b981').setAlpha(1).setScale(0.8);

    this.scene.tweens.add({
      targets: this.announcementText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 350,
      ease: 'Back.easeOut',
    });
  }

  public destroy(): void {
    this.container.destroy();
  }
}
