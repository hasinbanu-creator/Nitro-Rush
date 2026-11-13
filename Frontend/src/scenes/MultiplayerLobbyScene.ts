/**
 * MultiplayerLobbyScene.ts
 *
 * Nitro Rush Multiplayer Lobby & Matchmaking Scene (Milestone 8.4 Phase 2)
 *
 * Implements:
 * - Real-time WebSocket connection lifecycle via NetworkManager.
 * - Guest authentication and session recovery via SessionStore.
 * - 8-player room grid slots (P1 to P8) with driver cards, car previews, and ready badges.
 * - Real-time slot synchronization via ROOM_ASSIGNED, PLAYER_JOINED, PLAYER_LEFT, PLAYER_READY_STATUS.
 * - Vehicle selector (BOLT-GT, VIPER-R, PHANTOM-EX, RALLY-APEX) sending SELECT_CAR.
 * - Ready/Unready toggle button sending PLAYER_READY.
 * - 15-second collection window banner (activated when >= 2 racers ready).
 * - Synchronized 3-2-1 countdown overlay triggered by COUNTDOWN_STARTED.
 * - Disconnection / connection error recovery overlay with retry controls.
 */

import Phaser from 'phaser';
import { networkManager } from '../multiplayer/NetworkManager';
import { sessionStore } from '../multiplayer/SessionStore';
import {
  MessageType,
  ConnectionState,
  type PlayerSlotInfo,
  type MatchmakingStatusPayload,
  type RoomAssignedPayload,
  type PlayerJoinedPayload,
  type PlayerLeftPayload,
  type PlayerReadyStatusPayload,
  type CountdownStartedPayload,
  type RaceStartedPayload,
  type ErrorPayload,
  type PrivateRoomCreatedPayload,
  type PrivateRoomJoinedPayload,
  type PrivateRoomUpdatedPayload,
  type PrivateRoomErrorPayload,
} from '../multiplayer/ProtocolTypes';
import { CARS } from '../data/CarData';
import { TRACKS } from '../data/TrackData';
import { SoundEffects } from '../utils/SoundEffects';
import { UIHelpers } from '../utils/UIHelpers';
import { type MultiplayerRaceLaunchData } from './MultiplayerRaceScene';

export interface MultiplayerLobbyLaunchData {
  mode?: 'QUICK_MATCH' | 'CREATE_ROOM' | 'JOIN_ROOM' | 'PRIVATE_ROOM';
  roomCode?: string;
  preferredTrackId?: string;
  preferredCarId?: string;
}

interface SlotCardUI {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  slotBadge: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  carText: Phaser.GameObjects.Text;
  statusBadge: Phaser.GameObjects.Text;
  statusBg: Phaser.GameObjects.Graphics;
  carSprite?: Phaser.GameObjects.Sprite;
}

export class MultiplayerLobbyScene extends Phaser.Scene {
  // Launch configuration and mode
  private launchData: MultiplayerLobbyLaunchData = { mode: 'QUICK_MATCH' };
  private isPrivateRoom: boolean = false;
  private roomCode: string | null = null;
  private hostPlayerId: string | null = null;
  private isHost: boolean = false;

  // Navigation & session state
  private localPlayerId: string | null = null;
  private localSlotId: string | null = null;
  private currentRoomId: string | null = null;
  private currentTrackId: string = 'coastal-rush';
  private selectedCarId: string = 'bolt-gt';
  private isLocalReady: boolean = false;

  // 8 Player slots tracked in room
  private slots: (PlayerSlotInfo | null)[] = new Array(8).fill(null);
  private slotUIs: SlotCardUI[] = [];

  // Collection timer state
  private collectionWindowActive: boolean = false;
  private collectionTimeRemainingSec: number = 15;
  private collectionTimerEvent: Phaser.Time.TimerEvent | null = null;

  // Countdown state
  private isCountdownActive: boolean = false;

  // UI Containers & Elements
  private headerContainer!: Phaser.GameObjects.Container;
  private statusPillText!: Phaser.GameObjects.Text;
  private statusPillDot!: Phaser.GameObjects.Arc;
  private roomInfoText!: Phaser.GameObjects.Text;
  private copyCodeBtnContainer: Phaser.GameObjects.Container | null = null;
  private collectionBannerContainer!: Phaser.GameObjects.Container;
  private collectionBannerText!: Phaser.GameObjects.Text;
  private collectionBannerBar!: Phaser.GameObjects.Graphics;
  private readyButtonContainer!: Phaser.GameObjects.Container;
  private readyButtonText!: Phaser.GameObjects.Text;
  private readyButtonBg!: Phaser.GameObjects.Graphics;
  private hostStartButtonContainer: Phaser.GameObjects.Container | null = null;
  private hostStartButtonText: Phaser.GameObjects.Text | null = null;
  private hostStartButtonBg: Phaser.GameObjects.Graphics | null = null;
  private hostStatusText: Phaser.GameObjects.Text | null = null;
  private carSelectorButtons: { id: string; container: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics }[] = [];
  private trackNameText!: Phaser.GameObjects.Text;
  private errorModalContainer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'MultiplayerLobbyScene' });
  }

  init(data?: MultiplayerLobbyLaunchData): void {
    if (data) {
      this.launchData = data;
      if (data.mode === 'CREATE_ROOM' || data.mode === 'JOIN_ROOM' || data.mode === 'PRIVATE_ROOM') {
        this.isPrivateRoom = true;
      }
      if (data.roomCode) {
        this.roomCode = data.roomCode.trim().toUpperCase();
      }
    }
  }

  create(): void {
    const { width, height } = this.scale;

    // Reset local state
    this.slots = new Array(8).fill(null);
    this.isLocalReady = false;
    this.collectionWindowActive = false;
    this.isCountdownActive = false;
    this.hostPlayerId = null;
    this.isHost = false;

    // Default to stored car or bolt-gt
    this.selectedCarId = sessionStore.getSession() ? 'bolt-gt' : 'bolt-gt';

    // 1. Cyberpunk background
    this.createBackground(width, height);

    // 2. Header Bar (Status, ping, title, leave button)
    this.createHeader(width);

    // 3. 8 Grid Slot Cards (2 rows of 4 cards)
    this.createSlotGrid(width);

    // 4. Middle Collection Window Banner
    this.createCollectionBanner(width);

    // 5. Bottom Controls (Track selector, Car selector bar, Ready button)
    this.createControlsPanel(width, height);

    // 6. Bind NetworkManager Event Listeners
    this.setupNetworkListeners();

    // 7. Initiate Connection and Room Join Flow
    this.initiateConnectionFlow();

    // ESC key leaves lobby
    this.input.keyboard?.on('keydown-ESC', () => {
      this.handleLeaveLobby();
    });

    // Space key toggles ready
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.isCountdownActive && this.currentRoomId) {
        this.toggleReady();
      }
    });

    // Clean up on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupScene();
    });

    // Fade camera in from black
    this.cameras.main.fadeIn(300, 7, 10, 20);
  }

  // ==========================================================================
  // Visual Layout & UI Creation
  // ==========================================================================

  private createBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x060811, 0x060811, 0x0c1322, 0x090c1a, 1);
    bg.fillRect(0, 0, width, height);

    // Ambient glow orbs
    const cyanGlow = this.add.sprite(width * 0.15, height * 0.2, 'glow_orb')
      .setScale(3.0)
      .setAlpha(0.18)
      .setTint(0x00f0ff)
      .setBlendMode(Phaser.BlendModes.ADD);

    const orangeGlow = this.add.sprite(width * 0.85, height * 0.8, 'glow_orb')
      .setScale(3.5)
      .setAlpha(0.2)
      .setTint(0xff5500)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: [cyanGlow, orangeGlow],
      alpha: { from: 0.12, to: 0.24 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private createHeader(width: number): void {
    this.headerContainer = this.add.container(0, 0).setDepth(20);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x090d1a, 0.95);
    barBg.fillRect(0, 0, width, 56);
    barBg.lineStyle(1, 0x00f0ff, 0.4);
    barBg.lineBetween(0, 56, width, 56);
    this.headerContainer.add(barBg);

    // Leave Button (Left)
    const leaveBtn = UIHelpers.createCyberButton({
      scene: this,
      x: 90,
      y: 28,
      width: 140,
      height: 36,
      label: 'LEAVE',
      icon: '◄',
      isPrimary: false,
      onClick: () => this.handleLeaveLobby(),
    });
    this.headerContainer.add(leaveBtn);

    // Title & Room ID (Center)
    const titleText = this.add.text(width / 2, 20, 'NITRO RUSH // MULTIPLAYER LOBBY', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);

    this.roomInfoText = this.add.text(width / 2, 40, 'CONNECTING TO GAME SERVER...', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.headerContainer.add([titleText, this.roomInfoText]);

    // Copy Code Button (Between Room Info and Status Pill, visible in private custom rooms)
    const copyBtn = UIHelpers.createCyberButton({
      scene: this,
      x: width / 2 + 205,
      y: 28,
      width: 125,
      height: 32,
      label: 'COPY CODE',
      icon: '📋',
      isPrimary: false,
      onClick: () => this.copyRoomCodeToClipboard(),
    });
    this.copyCodeBtnContainer = copyBtn;
    this.copyCodeBtnContainer.setVisible(false);
    this.headerContainer.add(copyBtn);

    // Connection & Ping Status Pill (Right)
    const pillX = width - 130;
    const pillY = 28;

    const pillBg = this.add.graphics();
    pillBg.fillStyle(0x0f172a, 0.8);
    pillBg.lineStyle(1, 0x334155, 0.8);
    pillBg.strokeRoundedRect(pillX - 90, pillY - 14, 180, 28, 4);
    pillBg.fillRoundedRect(pillX - 90, pillY - 14, 180, 28, 4);
    this.headerContainer.add(pillBg);

    this.statusPillDot = this.add.circle(pillX - 74, pillY, 4, 0xf59e0b);
    this.statusPillText = this.add.text(pillX - 60, pillY, 'CONNECTING', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#f59e0b',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.headerContainer.add([this.statusPillDot, this.statusPillText]);
  }

  private createSlotGrid(width: number): void {
    this.slotUIs = [];
    const cardW = 250;
    const cardH = 96;
    const startX = (width - (4 * cardW + 3 * 20)) / 2 + cardW / 2; // centered
    const row0Y = 118;
    const row1Y = 226;

    for (let i = 0; i < 8; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = startX + col * (cardW + 20);
      const y = row === 0 ? row0Y : row1Y;
      const slotNum = `P${i + 1}`;

      const cardContainer = this.add.container(x, y).setDepth(10);

      const bg = this.add.graphics();
      cardContainer.add(bg);

      // Slot badge
      const slotBadge = this.add.text(-cardW / 2 + 12, -cardH / 2 + 10, slotNum, {
        fontFamily: '"Impact", "Segoe UI", sans-serif',
        fontSize: '16px',
        color: '#64748b',
      });

      // Driver name
      const nameText = this.add.text(-cardW / 2 + 42, -cardH / 2 + 10, '[EMPTY SLOT]', {
        fontFamily: '"Impact", "Segoe UI", sans-serif',
        fontSize: '15px',
        color: '#475569',
        letterSpacing: 1,
      });

      // Car name
      const carText = this.add.text(-cardW / 2 + 12, 4, 'WAITING FOR RACER...', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#475569',
      });

      // Status badge graphics & text
      const statusBg = this.add.graphics();
      const statusBadge = this.add.text(cardW / 2 - 14, cardH / 2 - 16, 'OPEN', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#475569',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      cardContainer.add([slotBadge, nameText, carText, statusBg, statusBadge]);

      const slotUI: SlotCardUI = {
        container: cardContainer,
        bg,
        slotBadge,
        nameText,
        carText,
        statusBadge,
        statusBg,
      };

      this.slotUIs.push(slotUI);
      this.renderSlotCard(i, null);
    }
  }

  private renderSlotCard(index: number, player: PlayerSlotInfo | null): void {
    const ui = this.slotUIs[index];
    if (!ui) return;

    const cardW = 250;
    const cardH = 96;
    const isLocal = player && (
      (this.localSlotId && player.slot && player.slot.toUpperCase() === this.localSlotId.toUpperCase()) ||
      (this.localPlayerId && player.id === this.localPlayerId)
    );

    ui.bg.clear();
    ui.statusBg.clear();

    if (!player) {
      // Empty slot styling
      ui.bg.fillStyle(0x0a1020, 0.4);
      ui.bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
      ui.bg.lineStyle(1, 0x1e293b, 0.6);
      ui.bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);

      ui.slotBadge.setText(`P${index + 1}`).setColor('#475569');
      ui.nameText.setText('[OPEN SLOT]').setColor('#475569');
      ui.carText.setText('WAITING FOR RACER...').setColor('#334155');
      ui.statusBadge.setText('OPEN').setColor('#475569');
      return;
    }

    // Occupied slot styling
    const bgFill = isLocal ? 0x0f2438 : 0x0d1527;
    const borderColor = isLocal ? 0x00f0ff : (player.isReady ? 0x10b981 : 0x334155);

    ui.bg.fillStyle(bgFill, 0.9);
    ui.bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
    ui.bg.lineStyle(isLocal ? 2 : 1, borderColor, isLocal ? 0.9 : 0.7);
    ui.bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);

    // Slot badge
    const isRoomHost = this.isPrivateRoom && (
      (this.hostPlayerId && player.id === this.hostPlayerId) ||
      (!this.hostPlayerId && index === 0)
    );
    const badgeColor = isRoomHost ? '#ffaa00' : (index === 0 ? '#ffaa00' : (isLocal ? '#00f0ff' : '#94a3b8'));
    ui.slotBadge.setText(isRoomHost ? `P${index + 1} 👑` : (index === 0 ? 'P1 ★' : `P${index + 1}`)).setColor(badgeColor);

    // Driver name
    const hostTag = isRoomHost ? ' 👑 HOST' : '';
    const displayName = isLocal ? `${player.name} (YOU)${hostTag}` : `${player.name}${hostTag}`;
    ui.nameText.setText(displayName).setColor(isLocal ? '#ffffff' : '#cbd5e1');

    // Selected car display
    const carConfig = CARS.find((c) => c.id === player.carId) || CARS[0];
    ui.carText.setText(`CAR: ${carConfig.name.toUpperCase()}`).setColor('#00f0ff');

    // Status badge (READY or SELECTING)
    if (player.isReady) {
      ui.statusBg.fillStyle(0x064e3b, 0.9);
      ui.statusBg.fillRoundedRect(cardW / 2 - 76, cardH / 2 - 26, 66, 18, 3);
      ui.statusBg.lineStyle(1, 0x10b981, 0.9);
      ui.statusBg.strokeRoundedRect(cardW / 2 - 76, cardH / 2 - 26, 66, 18, 3);

      ui.statusBadge.setText('✓ READY').setColor('#10b981');
    } else {
      ui.statusBg.fillStyle(0x451a03, 0.8);
      ui.statusBg.fillRoundedRect(cardW / 2 - 86, cardH / 2 - 26, 76, 18, 3);
      ui.statusBg.lineStyle(1, 0xf59e0b, 0.8);
      ui.statusBg.strokeRoundedRect(cardW / 2 - 86, cardH / 2 - 26, 76, 18, 3);

      ui.statusBadge.setText('SELECTING').setColor('#f59e0b');
    }
  }

  private createCollectionBanner(width: number): void {
    const bannerY = 345;
    this.collectionBannerContainer = this.add.container(width / 2, bannerY).setDepth(15);
    this.collectionBannerContainer.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.92);
    bg.fillRoundedRect(-380, -18, 760, 36, 6);
    bg.lineStyle(1.5, 0x00f0ff, 0.8);
    bg.strokeRoundedRect(-380, -18, 760, 36, 6);
    this.collectionBannerContainer.add(bg);

    this.collectionBannerText = this.add.text(0, 0, '⚡ 15s COLLECTION WINDOW ACTIVE • ADDITIONAL RACERS MAY JOIN', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#00f0ff',
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0.5);
    this.collectionBannerContainer.add(this.collectionBannerText);

    // Progress bar line at bottom of banner
    this.collectionBannerBar = this.add.graphics();
    this.collectionBannerContainer.add(this.collectionBannerBar);
  }

  private createControlsPanel(width: number, height: number): void {
    const panelY = height - 175;

    // Panel frame
    const frame = this.add.graphics();
    frame.fillStyle(0x080c17, 0.9);
    frame.fillRoundedRect(40, panelY, width - 80, 140, 8);
    frame.lineStyle(1, 0x1e293b, 0.8);
    frame.strokeRoundedRect(40, panelY, width - 80, 140, 8);

    // Section 1: Track Preview & Info (Left Column)
    const trackColX = 170;
    const trackColY = panelY + 28;

    this.add.text(trackColX, trackColY, 'CIRCUIT SELECTION', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#94a3b8',
      letterSpacing: 1,
    }).setOrigin(0.5);

    const currentTrack = TRACKS.find((t) => t.id === this.currentTrackId) || TRACKS[0];
    this.trackNameText = this.add.text(trackColX, trackColY + 30, currentTrack.name.toUpperCase(), {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '22px',
      color: '#00f0ff',
      letterSpacing: 1,
    }).setOrigin(0.5);

    this.add.text(trackColX, trackColY + 58, `3 LAPS • ${currentTrack.environment.toUpperCase()}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#64748b',
    }).setOrigin(0.5);

    // Section 2: Vehicle Selection Carousel (Middle Column)
    const carColX = width / 2;
    const carColY = panelY + 28;

    this.add.text(carColX, carColY, 'SELECT YOUR VEHICLE', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#94a3b8',
      letterSpacing: 1,
    }).setOrigin(0.5);

    this.carSelectorButtons = [];
    const carBtnW = 120;
    const carBtnH = 46;
    const carSpacing = 130;
    const carStartX = carColX - (1.5 * carSpacing);

    CARS.forEach((car, index) => {
      const bx = carStartX + index * carSpacing;
      const by = carColY + 44;

      const btnContainer = this.add.container(bx, by);
      const bg = this.add.graphics();
      btnContainer.add(bg);

      const label = this.add.text(0, 0, car.name.toUpperCase(), {
        fontFamily: '"Impact", "Segoe UI", sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        letterSpacing: 1,
      }).setOrigin(0.5);
      btnContainer.add(label);

      btnContainer.setSize(carBtnW, carBtnH);
      btnContainer.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-carBtnW / 2, -carBtnH / 2, carBtnW, carBtnH),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });

      btnContainer.on('pointerdown', () => {
        if (!this.isLocalReady && !this.isCountdownActive) {
          this.handleCarSelected(car.id);
        }
      });

      this.carSelectorButtons.push({ id: car.id, container: btnContainer, bg });
    });
    this.refreshCarSelectionUI();

    // Section 3: Large Prominent READY Toggle Button (Right Column)
    const readyX = width - 170;
    const readyY = panelY + 70;

    this.readyButtonContainer = this.add.container(readyX, readyY);
    this.readyButtonBg = this.add.graphics();
    this.readyButtonContainer.add(this.readyButtonBg);

    this.readyButtonText = this.add.text(0, 0, 'READY UP', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.readyButtonContainer.add(this.readyButtonText);

    const rBtnW = 180;
    const rBtnH = 58;
    this.readyButtonContainer.setSize(rBtnW, rBtnH);
    this.readyButtonContainer.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    this.readyButtonContainer.on('pointerdown', () => {
      this.toggleReady();
    });

    // Host Start Button (Exclusive to Room Host in Private Custom Rooms)
    this.hostStartButtonContainer = this.add.container(readyX, panelY + 95);
    this.hostStartButtonBg = this.add.graphics();
    this.hostStartButtonContainer.add(this.hostStartButtonBg);

    this.hostStartButtonText = this.add.text(0, 0, 'START RACE', {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.hostStartButtonContainer.add(this.hostStartButtonText);

    this.hostStartButtonContainer.setSize(rBtnW, 46);
    this.hostStartButtonContainer.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-rBtnW / 2, -23, rBtnW, 46),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    this.hostStartButtonContainer.on('pointerdown', () => {
      this.handleHostStartClick();
    });
    this.hostStartButtonContainer.setVisible(false);

    // Non-host status text
    this.hostStatusText = this.add.text(readyX, panelY + 95, 'WAITING FOR HOST TO START...', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00f0ff',
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0.5);
    this.hostStatusText.setVisible(false);

    this.updateReadyButtonUI();
    this.updateHostStartButtonUI();

    // Footer Help Bar
    this.add.text(width / 2, height - 16, '[ESC] LEAVE LOBBY  •  [SPACE] TOGGLE READY  •  ROOM CAPACITY: 8 RACERS', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#475569',
    }).setOrigin(0.5);
  }

  private refreshCarSelectionUI(): void {
    const carBtnW = 120;
    const carBtnH = 46;

    this.carSelectorButtons.forEach((btn) => {
      const isSelected = btn.id === this.selectedCarId;
      btn.bg.clear();

      if (isSelected) {
        btn.bg.fillStyle(0x00f0ff, 0.25);
        btn.bg.fillRoundedRect(-carBtnW / 2, -carBtnH / 2, carBtnW, carBtnH, 4);
        btn.bg.lineStyle(2, 0x00f0ff, 0.95);
        btn.bg.strokeRoundedRect(-carBtnW / 2, -carBtnH / 2, carBtnW, carBtnH, 4);
      } else {
        btn.bg.fillStyle(0x0f172a, 0.7);
        btn.bg.fillRoundedRect(-carBtnW / 2, -carBtnH / 2, carBtnW, carBtnH, 4);
        btn.bg.lineStyle(1, 0x334155, 0.7);
        btn.bg.strokeRoundedRect(-carBtnW / 2, -carBtnH / 2, carBtnW, carBtnH, 4);
      }
    });
  }

  private updateReadyButtonUI(): void {
    const rBtnW = 180;
    const isCustom = this.isPrivateRoom && !!this.currentRoomId;
    const rBtnH = isCustom ? 44 : 58;
    this.readyButtonBg.clear();

    if (!this.currentRoomId) {
      // Waiting in global matchmaking queue or initial connection
      this.readyButtonBg.fillStyle(0x1e293b, 0.9);
      this.readyButtonBg.fillRoundedRect(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH, 6);
      this.readyButtonBg.lineStyle(1, 0x475569, 0.8);
      this.readyButtonBg.strokeRoundedRect(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH, 6);

      this.readyButtonText.setText(this.isPrivateRoom ? 'CONNECTING...' : 'IN QUEUE');
      this.readyButtonText.setColor('#94a3b8');
      return;
    }

    if (this.isLocalReady) {
      // Amber Cancel Ready state
      this.readyButtonBg.fillStyle(0xd97706, 0.95);
      this.readyButtonBg.fillRoundedRect(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH, 6);
      this.readyButtonBg.lineStyle(2, 0xfbbf24, 1);
      this.readyButtonBg.strokeRoundedRect(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH, 6);

      this.readyButtonText.setText('CANCEL READY');
      this.readyButtonText.setColor('#ffffff');
    } else {
      // Emerald Ready Up state
      this.readyButtonBg.fillStyle(0x059669, 0.95);
      this.readyButtonBg.fillRoundedRect(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH, 6);
      this.readyButtonBg.lineStyle(2, 0x34d399, 1);
      this.readyButtonBg.strokeRoundedRect(-rBtnW / 2, -rBtnH / 2, rBtnW, rBtnH, 6);

      this.readyButtonText.setText('READY UP');
      this.readyButtonText.setColor('#ffffff');
    }
  }

  private updateHostStartButtonUI(): void {
    if (!this.isPrivateRoom || !this.currentRoomId) {
      this.hostStartButtonContainer?.setVisible(false);
      this.hostStatusText?.setVisible(false);
      this.readyButtonContainer.setPosition(this.scale.width - 170, this.scale.height - 175 + 70);
      return;
    }

    const rBtnW = 180;
    const readyX = this.scale.width - 170;
    const panelY = this.scale.height - 175;

    // Reposition ready button higher to make room for host controls
    this.readyButtonContainer.setPosition(readyX, panelY + 38);

    if (this.isHost) {
      this.hostStatusText?.setVisible(false);
      this.hostStartButtonContainer?.setVisible(true);

      const totalPlayers = this.slots.filter((s) => s !== null).length;
      const readyCount = this.slots.filter((s) => s && s.isReady).length;
      const canStart = totalPlayers >= 2 && readyCount === totalPlayers;

      this.hostStartButtonBg?.clear();
      if (canStart) {
        this.hostStartButtonBg?.fillStyle(0x059669, 0.95);
        this.hostStartButtonBg?.fillRoundedRect(-rBtnW / 2, -23, rBtnW, 46, 6);
        this.hostStartButtonBg?.lineStyle(2, 0x34d399, 1);
        this.hostStartButtonBg?.strokeRoundedRect(-rBtnW / 2, -23, rBtnW, 46, 6);

        this.hostStartButtonText?.setText('START RACE');
        this.hostStartButtonText?.setColor('#ffffff');
      } else {
        this.hostStartButtonBg?.fillStyle(0x1e293b, 0.85);
        this.hostStartButtonBg?.fillRoundedRect(-rBtnW / 2, -23, rBtnW, 46, 6);
        this.hostStartButtonBg?.lineStyle(1, 0x475569, 0.8);
        this.hostStartButtonBg?.strokeRoundedRect(-rBtnW / 2, -23, rBtnW, 46, 6);

        const msg = totalPlayers < 2 ? 'NEED 2+ RACERS' : 'WAITING FOR READY';
        this.hostStartButtonText?.setText(msg);
        this.hostStartButtonText?.setColor('#94a3b8');
      }
    } else {
      this.hostStartButtonContainer?.setVisible(false);
      this.hostStatusText?.setVisible(true);
      this.hostStatusText?.setText('WAITING FOR HOST...');
    }
  }

  private handleHostStartClick(): void {
    if (!this.isHost || !this.currentRoomId) return;

    const totalPlayers = this.slots.filter((s) => s !== null).length;
    const readyCount = this.slots.filter((s) => s && s.isReady).length;

    if (totalPlayers < 2) {
      SoundEffects.playModalClose();
      this.showErrorModal('CANNOT START RACE', 'At least 2 players are required to start a custom race.');
      return;
    }

    if (readyCount < totalPlayers) {
      SoundEffects.playModalClose();
      this.showErrorModal('CANNOT START RACE', 'All players in the room must be READY before the host can start.');
      return;
    }

    SoundEffects.playClick();
    networkManager.startPrivateRace({
      roomCode: this.roomCode || undefined,
      roomId: this.currentRoomId,
    });
  }

  private copyRoomCodeToClipboard(): void {
    if (!this.roomCode) return;
    SoundEffects.playClick();
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.roomCode).catch(() => {});
    }
    const textObj = this.copyCodeBtnContainer?.list.find(
      (obj) => obj instanceof Phaser.GameObjects.Text
    ) as Phaser.GameObjects.Text | undefined;
    if (textObj) {
      const orig = textObj.text;
      textObj.setText('✓ COPIED');
      this.time.delayedCall(1600, () => {
        textObj.setText(orig);
      });
    }
  }

  // ==========================================================================
  // Network Lifecycle & Connection Management
  // ==========================================================================

  private setupNetworkListeners(): void {
    // 1. Connection state changes
    networkManager.onStateChange((state) => {
      this.handleStateChange(state);
    });

    // 2. Latency / Ping updates
    networkManager.onLatency((rtt) => {
      this.statusPillText.setText(`ONLINE (${rtt}ms)`);
      this.statusPillDot.setFillStyle(rtt < 80 ? 0x10b981 : (rtt < 160 ? 0xf59e0b : 0xef4444));
    });

    // 2b. Matchmaking Queue Status updates
    networkManager.on(MessageType.MATCHMAKING_STATUS, (payload: MatchmakingStatusPayload) => {
      this.handleMatchmakingStatus(payload);
    });

    // 3. Room assigned (initial join response)
    networkManager.on(MessageType.ROOM_ASSIGNED, (payload: RoomAssignedPayload) => {
      this.handleRoomAssigned(payload);
    });

    // 4. Remote player joined
    networkManager.on(MessageType.PLAYER_JOINED, (payload: PlayerJoinedPayload) => {
      this.handleRemotePlayerJoined(payload);
    });

    // 5. Remote player left
    networkManager.on(MessageType.PLAYER_LEFT, (payload: PlayerLeftPayload) => {
      this.handleRemotePlayerLeft(payload);
    });

    // 6. Player ready / car status change
    networkManager.on(MessageType.PLAYER_READY_STATUS, (payload: PlayerReadyStatusPayload) => {
      this.handlePlayerReadyStatus(payload);
    });

    // 7. Synchronized Countdown started
    networkManager.on(MessageType.COUNTDOWN_STARTED, (payload: CountdownStartedPayload) => {
      this.handleCountdownStarted(payload);
    });

    // 8. Race started
    networkManager.on(MessageType.RACE_STARTED, (payload: RaceStartedPayload) => {
      this.handleRaceStarted(payload);
    });

    // 8b. Private room created (for host)
    networkManager.on(MessageType.PRIVATE_ROOM_CREATED, (payload: PrivateRoomCreatedPayload) => {
      this.handlePrivateRoomCreated(payload);
    });

    // 8c. Private room joined (for joiner)
    networkManager.on(MessageType.PRIVATE_ROOM_JOINED, (payload: PrivateRoomJoinedPayload) => {
      this.handlePrivateRoomJoined(payload);
    });

    // 8d. Private room updated (membership, host reassignment, ready updates)
    networkManager.on(MessageType.PRIVATE_ROOM_UPDATED, (payload: PrivateRoomUpdatedPayload) => {
      this.handlePrivateRoomUpdated(payload);
    });

    // 8e. Private room error
    networkManager.on(MessageType.PRIVATE_ROOM_ERROR, (payload: PrivateRoomErrorPayload) => {
      this.showErrorModal('CUSTOM ROOM ERROR', payload.message || payload.errorCode);
    });

    // 9. Protocol Errors
    networkManager.on(MessageType.ERROR, (payload: ErrorPayload) => {
      this.showErrorModal('SERVER ERROR', payload.message || payload.errorCode);
    });
  }

  private async initiateConnectionFlow(): Promise<void> {
    try {
      this.updateStatusPill(ConnectionState.CONNECTING);
      this.roomInfoText.setText('CONNECTING TO SERVER...');

      // 1. Connect to backend WebSocket
      await networkManager.connect();
      this.updateStatusPill(ConnectionState.CONNECTED);

      // 2. Authenticate as guest
      const storedName = sessionStore.getDisplayName();
      const defaultName = storedName || `Racer_${Math.floor(1000 + Math.random() * 9000)}`;

      this.roomInfoText.setText(`AUTHENTICATING AS "${defaultName}"...`);
      const auth = await networkManager.authenticateGuest(defaultName);
      this.localPlayerId = auth.guestToken;

      // 3. Dispatch join flow based on selected multiplayer mode
      if (this.launchData.mode === 'CREATE_ROOM') {
        this.roomInfoText.setText('CREATING PRIVATE ROOM...');
        networkManager.createPrivateRoom({
          preferredTrackId: this.currentTrackId,
          preferredCarId: this.selectedCarId,
        });
      } else if (this.launchData.mode === 'JOIN_ROOM') {
        const code = this.roomCode || '';
        this.roomInfoText.setText(`JOINING ROOM "${code}"...`);
        networkManager.joinPrivateRoom(code, this.selectedCarId);
      } else {
        this.roomInfoText.setText('JOINING MATCHMAKING QUEUE...');
        networkManager.send(MessageType.JOIN_MATCHMAKING, {
          preferredTrackId: this.currentTrackId,
          preferredCarId: this.selectedCarId,
        });
      }
    } catch (err) {
      this.updateStatusPill(ConnectionState.DISCONNECTED);
      this.showErrorModal(
        'CONNECTION FAILED',
        'Could not establish connection to the Nitro Rush game server. Verify backend is running on ws://localhost:8080/ws/game.'
      );
    }
  }

  private handleStateChange(state: ConnectionState): void {
    this.updateStatusPill(state);

    if (state === ConnectionState.DISCONNECTED && !this.isCountdownActive) {
      this.showErrorModal(
        'DISCONNECTED',
        'Connection to the game server was lost. Please check your network and retry.'
      );
    }
  }

  private updateStatusPill(state: ConnectionState): void {
    if (state === ConnectionState.AUTHENTICATED || state === ConnectionState.CONNECTED) {
      this.statusPillDot.setFillStyle(0x10b981);
      this.statusPillText.setText('ONLINE').setColor('#10b981');
    } else if (state === ConnectionState.CONNECTING || state === ConnectionState.AUTHENTICATING) {
      this.statusPillDot.setFillStyle(0xf59e0b);
      this.statusPillText.setText('CONNECTING').setColor('#f59e0b');
    } else {
      this.statusPillDot.setFillStyle(0xef4444);
      this.statusPillText.setText('OFFLINE').setColor('#ef4444');
    }
  }

  // ==========================================================================
  // Room Events & Slot State Handling
  // ==========================================================================

  private handleMatchmakingStatus(payload: MatchmakingStatusPayload): void {
    if (this.currentRoomId) {
      return; // Already in assigned room
    }

    if (payload.status === 'QUEUED') {
      this.collectionWindowActive = false;
      this.roomInfoText.setText(
        `GLOBAL QUEUE // POSITION: #${payload.position} // WAITING FOR RACERS (${payload.totalWaiting}/${payload.maxPlayers ?? 8})`
      );
      this.collectionBannerContainer.setVisible(true);
      this.collectionBannerText.setText(
        `SEARCHING FOR RACERS • QUEUE POSITION #${payload.position} • WAITING FOR COMPETITORS (${payload.totalWaiting}/${payload.maxPlayers ?? 8})`
      );
      this.collectionBannerBar.clear();
      this.collectionBannerBar.fillStyle(0x334155, 0.8);
      this.collectionBannerBar.fillRoundedRect(-380, 14, 760 * ((payload.totalWaiting || 1) / (payload.maxPlayers ?? 8)), 3, 1);
    } else if (payload.status === 'COLLECTION_WINDOW') {
      this.collectionWindowActive = true;
      const remaining = payload.collectionTimeRemainingSec ?? 15;
      this.roomInfoText.setText(
        `⚡ MATCH FOUND // STARTING IN ${remaining}s // RACERS: (${payload.totalWaiting}/${payload.maxPlayers ?? 8})`
      );
      this.collectionBannerContainer.setVisible(true);
      this.collectionBannerText.setText(
        `⚡ MATCH STARTING IN ${remaining}s • ADDITIONAL RACERS MAY JOIN (${payload.totalWaiting}/${payload.maxPlayers ?? 8} READY)`
      );
      const ratio = Math.max(0, Math.min(1, remaining / 15));
      this.collectionBannerBar.clear();
      this.collectionBannerBar.fillStyle(0x00f0ff, 0.9);
      this.collectionBannerBar.fillRoundedRect(-380, 14, 760 * ratio, 3, 1);
    } else if (payload.status === 'CANCELLED') {
      this.collectionWindowActive = false;
      this.collectionBannerContainer.setVisible(false);
      this.roomInfoText.setText('MATCHMAKING CANCELLED');
    }
  }

  private handleRoomAssigned(payload: RoomAssignedPayload): void {
    this.currentRoomId = payload.roomId;
    this.currentTrackId = payload.trackId;
    this.localSlotId = payload.slotId;

    const trackConfig = TRACKS.find((t) => t.id === payload.trackId) || TRACKS[0];
    this.trackNameText.setText(trackConfig.name.toUpperCase());
    this.roomInfoText.setText(`ROOM #${payload.roomId.toUpperCase()} // ${trackConfig.name.toUpperCase()} // SLOT: ${this.localSlotId}`);

    // Populate all 8 slots from payload.players
    this.slots = new Array(8).fill(null);
    payload.players.forEach((p) => {
      const idx = this.slotIndexFromSlotString(p.slot);
      if (idx >= 0 && idx < 8) {
        this.slots[idx] = p;
        const isLocal = (this.localSlotId && p.slot && p.slot.toUpperCase() === this.localSlotId.toUpperCase()) ||
                        (this.localPlayerId && p.id === this.localPlayerId);
        if (isLocal) {
          this.localPlayerId = p.id;
          this.isLocalReady = p.isReady;
          this.selectedCarId = p.carId;
        }
      }
    });

    this.refreshAllSlotCards();
    this.refreshCarSelectionUI();
    this.updateReadyButtonUI();
    this.evaluateCollectionWindow();
    SoundEffects.playClick();
  }

  private handleRemotePlayerJoined(payload: PlayerJoinedPayload): void {
    const player = payload.player;
    const idx = this.slotIndexFromSlotString(player.slot);
    if (idx >= 0 && idx < 8) {
      this.slots[idx] = player;
      this.renderSlotCard(idx, player);
      SoundEffects.playClick();
      if (this.isPrivateRoom) {
        this.updateHostStartButtonUI();
        this.updatePrivateRoomBanner();
      } else {
        this.evaluateCollectionWindow();
      }
    }
  }

  private handleRemotePlayerLeft(payload: PlayerLeftPayload): void {
    const idx = this.slotIndexFromSlotString(payload.slot);
    if (idx >= 0 && idx < 8) {
      this.slots[idx] = null;
      this.renderSlotCard(idx, null);
      if (this.isPrivateRoom) {
        this.updateHostStartButtonUI();
        this.updatePrivateRoomBanner();
      } else {
        this.evaluateCollectionWindow();
      }
    }
  }

  private handlePlayerReadyStatus(payload: PlayerReadyStatusPayload): void {
    // Find player by playerId across slots
    for (let i = 0; i < 8; i++) {
      const p = this.slots[i];
      if (p && p.id === payload.playerId) {
        p.isReady = payload.isReady;
        p.carId = payload.carId;
        this.renderSlotCard(i, p);

        const isLocal = (this.localSlotId && p.slot && p.slot.toUpperCase() === this.localSlotId.toUpperCase()) ||
                        (this.localPlayerId && p.id === this.localPlayerId);
        if (isLocal) {
          this.isLocalReady = payload.isReady;
          this.updateReadyButtonUI();
        }
        break;
      }
    }

    if (this.isPrivateRoom) {
      this.updateHostStartButtonUI();
      this.updatePrivateRoomBanner();
    } else {
      this.evaluateCollectionWindow();
    }
  }

  private handlePrivateRoomCreated(payload: PrivateRoomCreatedPayload): void {
    this.isPrivateRoom = true;
    this.roomCode = payload.roomCode;
    this.currentRoomId = payload.roomId;
    this.currentTrackId = payload.trackId;
    this.localSlotId = payload.slotId;
    this.hostPlayerId = payload.hostPlayerId;
    this.isHost = true;

    const trackConfig = TRACKS.find((t) => t.id === payload.trackId) || TRACKS[0];
    this.trackNameText.setText(trackConfig.name.toUpperCase());

    this.updateHeaderRoomCode();
    this.populateSlots(payload.players);
    this.updateHostStartButtonUI();
    this.updatePrivateRoomBanner();
    SoundEffects.playClick();
  }

  private handlePrivateRoomJoined(payload: PrivateRoomJoinedPayload): void {
    this.isPrivateRoom = true;
    this.roomCode = payload.roomCode;
    this.currentRoomId = payload.roomId;
    this.currentTrackId = payload.trackId;
    this.localSlotId = payload.slotId;
    this.hostPlayerId = payload.hostPlayerId;
    this.isHost = (this.hostPlayerId !== null && (
      this.hostPlayerId === this.localPlayerId ||
      (this.localSlotId !== null && this.hostPlayerId === this.localSlotId.toLowerCase())
    ));

    const trackConfig = TRACKS.find((t) => t.id === payload.trackId) || TRACKS[0];
    this.trackNameText.setText(trackConfig.name.toUpperCase());

    this.updateHeaderRoomCode();
    this.populateSlots(payload.players);
    this.updateHostStartButtonUI();
    this.updatePrivateRoomBanner();
    SoundEffects.playClick();
  }

  private handlePrivateRoomUpdated(payload: PrivateRoomUpdatedPayload): void {
    this.isPrivateRoom = true;
    this.roomCode = payload.roomCode;
    this.currentRoomId = payload.roomId;
    this.hostPlayerId = payload.hostPlayerId;
    this.isHost = (this.hostPlayerId !== null && (
      this.hostPlayerId === this.localPlayerId ||
      (this.localSlotId !== null && this.hostPlayerId === this.localSlotId.toLowerCase())
    ));

    this.updateHeaderRoomCode();
    this.populateSlots(payload.players);
    this.updateHostStartButtonUI();
    this.updatePrivateRoomBanner();
  }

  private populateSlots(players: PlayerSlotInfo[]): void {
    this.slots = new Array(8).fill(null);
    players.forEach((p) => {
      const idx = this.slotIndexFromSlotString(p.slot);
      if (idx >= 0 && idx < 8) {
        this.slots[idx] = p;
        const isLocal = (this.localSlotId && p.slot && p.slot.toUpperCase() === this.localSlotId.toUpperCase()) ||
                        (this.localPlayerId && p.id === this.localPlayerId);
        if (isLocal) {
          this.localPlayerId = p.id;
          this.isLocalReady = p.isReady;
          this.selectedCarId = p.carId;
        }
      }
    });

    this.refreshAllSlotCards();
    this.refreshCarSelectionUI();
    this.updateReadyButtonUI();
  }

  private updateHeaderRoomCode(): void {
    if (this.isPrivateRoom && this.roomCode) {
      this.roomInfoText.setText(`CUSTOM ROOM // CODE: ${this.roomCode} // SLOT: ${this.localSlotId || 'P1'}`);
      this.copyCodeBtnContainer?.setVisible(true);
    } else {
      this.copyCodeBtnContainer?.setVisible(false);
    }
  }

  private updatePrivateRoomBanner(): void {
    if (!this.isPrivateRoom || !this.currentRoomId) return;

    this.collectionBannerContainer.setVisible(true);
    const readyCount = this.slots.filter((s) => s && s.isReady).length;
    const total = this.slots.filter((s) => s !== null).length;
    const hostLabel = this.isHost ? 'YOU ARE HOST' : 'WAITING FOR HOST TO START';

    this.collectionBannerText.setText(
      `🔒 PRIVATE ROOM // CODE: ${this.roomCode || '------'} // ${readyCount}/${total} READY // ${hostLabel}`
    );

    this.collectionBannerBar.clear();
    const isReadyToStart = total >= 2 && readyCount === total;
    this.collectionBannerBar.fillStyle(isReadyToStart ? 0x10b981 : 0x00f0ff, 0.9);
    this.collectionBannerBar.fillRoundedRect(-380, 14, 760 * (total > 0 ? readyCount / total : 0), 3, 1);
  }

  private refreshAllSlotCards(): void {
    for (let i = 0; i < 8; i++) {
      this.renderSlotCard(i, this.slots[i]);
    }
  }

  private slotIndexFromSlotString(slotStr: string): number {
    if (!slotStr) return -1;
    const num = parseInt(slotStr.replace(/\D/g, ''), 10);
    return isNaN(num) ? -1 : num - 1;
  }

  // ==========================================================================
  // User Actions (Car selection & Ready toggle)
  // ==========================================================================

  private handleCarSelected(carId: string): void {
    if (this.selectedCarId === carId) return;
    this.selectedCarId = carId;
    this.refreshCarSelectionUI();
    SoundEffects.playHover();

    // If connected to room, send SELECT_CAR to server
    if (this.currentRoomId) {
      networkManager.send(MessageType.SELECT_CAR, {
        roomId: this.currentRoomId,
        carId,
      });
    }
  }

  private toggleReady(): void {
    if (!this.currentRoomId) return;

    this.isLocalReady = !this.isLocalReady;
    this.updateReadyButtonUI();
    SoundEffects.playClick();

    // Transmit PLAYER_READY to server
    networkManager.send(MessageType.PLAYER_READY, {
      roomId: this.currentRoomId,
      isReady: this.isLocalReady,
    });
  }

  private handleLeaveLobby(): void {
    SoundEffects.playClick();

    if (this.isPrivateRoom) {
      networkManager.leavePrivateRoom({
        roomCode: this.roomCode || undefined,
        roomId: this.currentRoomId || undefined,
      });
    } else {
      if (this.currentRoomId) {
        networkManager.send(MessageType.CANCEL_MATCHMAKING, {
          roomId: this.currentRoomId,
        });
      } else {
        networkManager.send(MessageType.CANCEL_MATCHMAKING, {});
      }
    }

    this.cameras.main.fadeOut(250, 7, 10, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MainMenuScene');
    });
  }

  // ==========================================================================
  // Collection Window & Countdown Overlays
  // ==========================================================================

  private evaluateCollectionWindow(): void {
    if (this.isPrivateRoom) {
      this.cancelCollectionWindow();
      this.updatePrivateRoomBanner();
      this.updateHostStartButtonUI();
      return;
    }

    if (!this.currentRoomId) {
      return; // In-room ready collection window only applies once assigned to a room
    }

    // Count ready racers
    let readyCount = 0;
    this.slots.forEach((s) => {
      if (s && s.isReady) readyCount++;
    });

    if (readyCount >= 2 && !this.collectionWindowActive && !this.isCountdownActive) {
      this.startCollectionWindow(15);
    } else if (readyCount < 2 && this.collectionWindowActive) {
      this.cancelCollectionWindow();
    }
  }

  private startCollectionWindow(durationSec: number): void {
    this.collectionWindowActive = true;
    this.collectionTimeRemainingSec = durationSec;
    this.collectionBannerContainer.setVisible(true);

    if (this.collectionTimerEvent) {
      this.collectionTimerEvent.destroy();
    }

    this.collectionTimerEvent = this.time.addEvent({
      delay: 1000,
      repeat: durationSec - 1,
      callback: () => {
        this.collectionTimeRemainingSec--;
        this.collectionBannerText.setText(
          `⚡ MATCH STARTING IN ${this.collectionTimeRemainingSec}s • ADDITIONAL RACERS MAY JOIN (${this.getReadyCount()}/8 READY)`
        );

        // Update progress bar
        const ratio = this.collectionTimeRemainingSec / durationSec;
        this.collectionBannerBar.clear();
        this.collectionBannerBar.fillStyle(0x00f0ff, 0.9);
        this.collectionBannerBar.fillRoundedRect(-380, 14, 760 * ratio, 3, 1);

        if (this.collectionTimeRemainingSec <= 0) {
          this.cancelCollectionWindow();
        }
      },
    });
  }

  private cancelCollectionWindow(): void {
    this.collectionWindowActive = false;
    this.collectionBannerContainer.setVisible(false);
    if (this.collectionTimerEvent) {
      this.collectionTimerEvent.destroy();
      this.collectionTimerEvent = null;
    }
  }

  private getReadyCount(): number {
    return this.slots.filter((s) => s && s.isReady).length;
  }

  private handleCountdownStarted(payload: CountdownStartedPayload): void {
    this.cancelCollectionWindow();
    this.isCountdownActive = true;

    const duration = payload.durationSeconds || 3;

    // Transition immediately to MultiplayerRaceScene with active room and starting grid context
    const activeSlots = this.slots.filter((s): s is PlayerSlotInfo => s !== null);
    const localSlot = this.slots.find(
      (s) => s && ((s.slot && s.slot.toUpperCase() === (this.localSlotId || 'P1').toUpperCase()) ||
                   (this.localPlayerId && s.id === this.localPlayerId))
    );
    const resolvedLocalPlayerId = localSlot ? localSlot.id : (this.localPlayerId || (this.localSlotId || 'P1').toLowerCase());

    const launchData: MultiplayerRaceLaunchData = {
      roomId: this.currentRoomId || '',
      trackId: this.currentTrackId,
      slotId: this.localSlotId || 'P1',
      localPlayerId: resolvedLocalPlayerId,
      slots: activeSlots,
      countdownDuration: duration,
    };

    this.scene.start('MultiplayerRaceScene', launchData);
  }

  private handleRaceStarted(_payload: RaceStartedPayload): void {
    if (!this.isCountdownActive) {
      const activeSlots = this.slots.filter((s): s is PlayerSlotInfo => s !== null);
      const localSlot = this.slots.find(
        (s) => s && ((s.slot && s.slot.toUpperCase() === (this.localSlotId || 'P1').toUpperCase()) ||
                     (this.localPlayerId && s.id === this.localPlayerId))
      );
      const resolvedLocalPlayerId = localSlot ? localSlot.id : (this.localPlayerId || (this.localSlotId || 'P1').toLowerCase());

      const launchData: MultiplayerRaceLaunchData = {
        roomId: this.currentRoomId || '',
        trackId: this.currentTrackId,
        slotId: this.localSlotId || 'P1',
        localPlayerId: resolvedLocalPlayerId,
        slots: activeSlots,
        countdownDuration: 0,
      };
      this.scene.start('MultiplayerRaceScene', launchData);
    }
  }

  // ==========================================================================
  // Error Modal Dialog
  // ==========================================================================

  private showErrorModal(titleStr: string, messageStr: string): void {
    if (this.errorModalContainer) {
      this.errorModalContainer.destroy();
      this.errorModalContainer = null;
    }

    const { width, height } = this.scale;
    this.errorModalContainer = this.add.container(width / 2, height / 2).setDepth(200);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.85);
    backdrop.fillRect(-width / 2, -height / 2, width, height);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    this.errorModalContainer.add(backdrop);

    const modalW = 500;
    const modalH = 240;
    const frame = this.add.graphics();
    frame.fillStyle(0x0c1322, 0.98);
    frame.fillRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 8);
    frame.lineStyle(2, 0xef4444, 0.9);
    frame.strokeRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, 8);
    this.errorModalContainer.add(frame);

    const title = this.add.text(0, -modalH / 2 + 36, titleStr, {
      fontFamily: '"Impact", "Segoe UI", sans-serif',
      fontSize: '22px',
      color: '#ef4444',
      letterSpacing: 2,
    }).setOrigin(0.5);

    const desc = this.add.text(0, -10, messageStr, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
      align: 'center',
      wordWrap: { width: modalW - 60 },
    }).setOrigin(0.5);
    this.errorModalContainer.add([title, desc]);

    // Retry Button
    const retryBtn = UIHelpers.createCyberButton({
      scene: this,
      x: -80,
      y: modalH / 2 - 38,
      width: 140,
      height: 40,
      label: 'RETRY',
      icon: '↻',
      isPrimary: true,
      accentColor: 0x00f0ff,
      onClick: () => {
        if (this.errorModalContainer) {
          this.errorModalContainer.destroy();
          this.errorModalContainer = null;
        }
        this.initiateConnectionFlow();
      },
    });

    // Exit Button
    const exitBtn = UIHelpers.createCyberButton({
      scene: this,
      x: 80,
      y: modalH / 2 - 38,
      width: 140,
      height: 40,
      label: 'MAIN MENU',
      icon: '◄',
      isPrimary: false,
      onClick: () => {
        if (this.errorModalContainer) {
          this.errorModalContainer.destroy();
          this.errorModalContainer = null;
        }
        this.handleLeaveLobby();
      },
    });

    this.errorModalContainer.add([retryBtn, exitBtn]);
    SoundEffects.playModalOpen();
  }

  // ==========================================================================
  // Teardown
  // ==========================================================================

  private cleanupScene(): void {
    if (this.collectionTimerEvent) {
      this.collectionTimerEvent.destroy();
      this.collectionTimerEvent = null;
    }

    networkManager.removeAllListeners();

    if (this.errorModalContainer) {
      this.errorModalContainer.destroy();
      this.errorModalContainer = null;
    }
  }
}
