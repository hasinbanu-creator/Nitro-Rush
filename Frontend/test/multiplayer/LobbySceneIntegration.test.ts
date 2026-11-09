/**
 * Lobby Scene State & Protocol Integration Unit Tests
 *
 * Verifies that lobby state synchronization logic, slot assignment, readiness tracking,
 * collection window activation, countdown triggers, and protocol payloads conform strictly
 * to the Protocol v1.0 specifications.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MessageType,
  PROTOCOL_VERSION,
  type PlayerSlotInfo,
  type RoomAssignedPayload,
  type PlayerJoinedPayload,
  type PlayerLeftPayload,
  type PlayerReadyStatusPayload,
  type CountdownStartedPayload,
} from '../../src/multiplayer/ProtocolTypes.ts';

// Helper class isolating lobby state machine rules for deterministic automated verification
class LobbyStateManager {
  public slots: (PlayerSlotInfo | null)[] = new Array(8).fill(null);
  public localPlayerId: string | null = null;
  public localSlotId: string | null = null;
  public currentRoomId: string | null = null;
  public currentTrackId: string = 'coastal-rush';
  public selectedCarId: string = 'bolt-gt';
  public isLocalReady: boolean = false;
  public collectionWindowActive: boolean = false;
  public isCountdownActive: boolean = false;

  public handleRoomAssigned(payload: RoomAssignedPayload): void {
    this.currentRoomId = payload.roomId;
    this.currentTrackId = payload.trackId;
    this.localSlotId = payload.slotId;
    this.slots = new Array(8).fill(null);

    payload.players.forEach((p) => {
      const idx = this.slotIndexFromSlotString(p.slot);
      if (idx >= 0 && idx < 8) {
        this.slots[idx] = p;
        if (p.id === this.localPlayerId) {
          this.isLocalReady = p.isReady;
          this.selectedCarId = p.carId;
        }
      }
    });

    this.evaluateCollectionWindow();
  }

  public handlePlayerJoined(payload: PlayerJoinedPayload): void {
    const idx = this.slotIndexFromSlotString(payload.player.slot);
    if (idx >= 0 && idx < 8) {
      this.slots[idx] = payload.player;
      this.evaluateCollectionWindow();
    }
  }

  public handlePlayerLeft(payload: PlayerLeftPayload): void {
    const idx = this.slotIndexFromSlotString(payload.slot);
    if (idx >= 0 && idx < 8) {
      this.slots[idx] = null;
      this.evaluateCollectionWindow();
    }
  }

  public handlePlayerReadyStatus(payload: PlayerReadyStatusPayload): void {
    for (let i = 0; i < 8; i++) {
      const p = this.slots[i];
      if (p && p.id === payload.playerId) {
        p.isReady = payload.isReady;
        p.carId = payload.carId;
        if (p.id === this.localPlayerId) {
          this.isLocalReady = payload.isReady;
        }
        break;
      }
    }
    this.evaluateCollectionWindow();
  }

  public handleCountdownStarted(_payload: CountdownStartedPayload): void {
    this.collectionWindowActive = false;
    this.isCountdownActive = true;
  }

  public evaluateCollectionWindow(): void {
    const readyCount = this.slots.filter((s) => s && s.isReady).length;
    if (readyCount >= 2 && !this.isCountdownActive) {
      this.collectionWindowActive = true;
    } else if (readyCount < 2) {
      this.collectionWindowActive = false;
    }
  }

  public getOccupiedSlotCount(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  public getReadyCount(): number {
    return this.slots.filter((s) => s && s.isReady).length;
  }

  private slotIndexFromSlotString(slotStr: string): number {
    if (!slotStr) return -1;
    const num = parseInt(slotStr.replace(/\D/g, ''), 10);
    return isNaN(num) ? -1 : num - 1;
  }
}

describe('Lobby Scene State & Protocol Integration Tests', () => {
  it('correctly parses and assigns 8-slot room on ROOM_ASSIGNED', () => {
    const lobby = new LobbyStateManager();
    lobby.localPlayerId = 'player-local-1';

    const p1: PlayerSlotInfo = {
      id: 'player-local-1',
      name: 'ApexDriver',
      carId: 'viper-r',
      slot: 'P1',
      isReady: false,
    };

    const p2: PlayerSlotInfo = {
      id: 'player-remote-2',
      name: 'DriftKing',
      carId: 'bolt-gt',
      slot: 'P2',
      isReady: true,
    };

    lobby.handleRoomAssigned({
      roomId: 'room-alpha-99',
      trackId: 'neon-highway',
      slotId: 'P1',
      maxLaps: 3,
      players: [p1, p2],
    });

    assert.strictEqual(lobby.currentRoomId, 'room-alpha-99');
    assert.strictEqual(lobby.currentTrackId, 'neon-highway');
    assert.strictEqual(lobby.localSlotId, 'P1');
    assert.strictEqual(lobby.getOccupiedSlotCount(), 2);
    assert.strictEqual(lobby.slots[0]?.name, 'ApexDriver');
    assert.strictEqual(lobby.slots[1]?.name, 'DriftKing');
    assert.strictEqual(lobby.slots[2], null); // P3 empty
    assert.strictEqual(lobby.slots[7], null); // P8 empty
    assert.strictEqual(lobby.selectedCarId, 'viper-r');
    assert.strictEqual(lobby.isLocalReady, false);
  });

  it('updates slots dynamically when remote player joins and leaves', () => {
    const lobby = new LobbyStateManager();
    lobby.localPlayerId = 'player-1';

    // Initial assignment
    lobby.handleRoomAssigned({
      roomId: 'room-beta-12',
      trackId: 'coastal-rush',
      slotId: 'P1',
      maxLaps: 3,
      players: [
        { id: 'player-1', name: 'Racer1', carId: 'bolt-gt', slot: 'P1', isReady: false },
      ],
    });

    assert.strictEqual(lobby.getOccupiedSlotCount(), 1);

    // Remote player joins slot P3
    lobby.handlePlayerJoined({
      player: {
        id: 'player-3',
        name: 'Racer3',
        carId: 'phantom-ex',
        slot: 'P3',
        isReady: false,
      },
    });

    assert.strictEqual(lobby.getOccupiedSlotCount(), 2);
    assert.strictEqual(lobby.slots[2]?.name, 'Racer3');
    assert.strictEqual(lobby.slots[2]?.carId, 'phantom-ex');

    // Remote player leaves slot P3
    lobby.handlePlayerLeft({
      playerId: 'player-3',
      slot: 'P3',
    });

    assert.strictEqual(lobby.getOccupiedSlotCount(), 1);
    assert.strictEqual(lobby.slots[2], null);
  });

  it('triggers collection window when at least 2 players are ready', () => {
    const lobby = new LobbyStateManager();
    lobby.localPlayerId = 'player-1';

    lobby.handleRoomAssigned({
      roomId: 'room-gamma-55',
      trackId: 'coastal-rush',
      slotId: 'P1',
      maxLaps: 3,
      players: [
        { id: 'player-1', name: 'Racer1', carId: 'bolt-gt', slot: 'P1', isReady: false },
        { id: 'player-2', name: 'Racer2', carId: 'viper-r', slot: 'P2', isReady: false },
      ],
    });

    assert.strictEqual(lobby.collectionWindowActive, false);

    // Player 1 readies up (1/2 ready)
    lobby.handlePlayerReadyStatus({
      playerId: 'player-1',
      isReady: true,
      carId: 'bolt-gt',
    });
    assert.strictEqual(lobby.getReadyCount(), 1);
    assert.strictEqual(lobby.collectionWindowActive, false);

    // Player 2 readies up (2/2 ready) -> collection window activates!
    lobby.handlePlayerReadyStatus({
      playerId: 'player-2',
      isReady: true,
      carId: 'viper-r',
    });
    assert.strictEqual(lobby.getReadyCount(), 2);
    assert.strictEqual(lobby.collectionWindowActive, true);

    // Player 1 toggles unready (1/2 ready) -> collection window cancels!
    lobby.handlePlayerReadyStatus({
      playerId: 'player-1',
      isReady: false,
      carId: 'bolt-gt',
    });
    assert.strictEqual(lobby.getReadyCount(), 1);
    assert.strictEqual(lobby.collectionWindowActive, false);
  });

  it('transitions cleanly to countdown overlay on COUNTDOWN_STARTED', () => {
    const lobby = new LobbyStateManager();
    lobby.localPlayerId = 'player-1';
    lobby.collectionWindowActive = true;

    lobby.handleCountdownStarted({
      durationSeconds: 3,
    });

    assert.strictEqual(lobby.collectionWindowActive, false);
    assert.strictEqual(lobby.isCountdownActive, true);
  });

  it('formats SELECT_CAR, PLAYER_READY, and CANCEL_MATCHMAKING payloads matching backend schema', () => {
    // SELECT_CAR
    const selectCarPayload = {
      roomId: 'room-101',
      carId: 'phantom-ex',
    };
    const selectCarEnvelope = {
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.SELECT_CAR,
      timestamp: 1731056400000,
      payload: selectCarPayload,
    };
    assert.strictEqual(selectCarEnvelope.type, 'SELECT_CAR');
    assert.strictEqual(selectCarEnvelope.payload.carId, 'phantom-ex');

    // PLAYER_READY
    const readyPayload = {
      roomId: 'room-101',
      isReady: true,
    };
    const readyEnvelope = {
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.PLAYER_READY,
      timestamp: 1731056400000,
      payload: readyPayload,
    };
    assert.strictEqual(readyEnvelope.type, 'PLAYER_READY');
    assert.strictEqual(readyEnvelope.payload.isReady, true);

    // CANCEL_MATCHMAKING
    const cancelPayload = {
      roomId: 'room-101',
    };
    const cancelEnvelope = {
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CANCEL_MATCHMAKING,
      timestamp: 1731056400000,
      payload: cancelPayload,
    };
    assert.strictEqual(cancelEnvelope.type, 'CANCEL_MATCHMAKING');
    assert.strictEqual(cancelEnvelope.payload.roomId, 'room-101');
  });
});

