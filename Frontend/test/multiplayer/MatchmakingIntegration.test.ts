/**
 * Milestone 8.5 — Frontend Matchmaking Integration & Protocol Unit Tests
 *
 * Verifies that:
 * 1. NetworkManager formats and transmits JOIN_MATCHMAKING and CANCEL_MATCHMAKING frames conforming to protocol schemas.
 * 2. NetworkManager dispatches MATCHMAKING_STATUS envelopes to registered event handlers.
 * 3. Matchmaking state machine tracks queue positions, collection window countdown, cancellation, and transitions to ROOM_ASSIGNED.
 * 4. In-room ready toggle is safely locked while in queue and unlocks upon ROOM_ASSIGNED.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MessageType,
  ConnectionState,
  PROTOCOL_VERSION,
  type MatchmakingStatusPayload,
  type RoomAssignedPayload,
  type PlayerSlotInfo,
} from '../../src/multiplayer/ProtocolTypes.ts';
import { MockWebSocket } from './MockWebSocket.ts';
import { NetworkManager } from '../../src/multiplayer/NetworkManager.ts';
import { SessionStore } from '../../src/multiplayer/SessionStore.ts';

// State machine isolating frontend matchmaking scene logic for deterministic testing
class MatchmakingSceneModel {
  public currentRoomId: string | null = null;
  public currentTrackId: string = 'coastal-rush';
  public localSlotId: string | null = null;
  public localPlayerId: string | null = null;

  public inQueue: boolean = false;
  public queuePosition: number = 0;
  public totalWaiting: number = 0;
  public collectionWindowActive: boolean = false;
  public collectionRemainingSec: number = 0;
  public isReady: boolean = false;
  public statusBannerText: string = '';

  public slots: (PlayerSlotInfo | null)[] = new Array(8).fill(null);

  public enterQueue(): void {
    this.inQueue = true;
    this.currentRoomId = null;
    this.isReady = false;
    this.statusBannerText = 'ENTERING MATCHMAKING QUEUE...';
  }

  public handleMatchmakingStatus(payload: MatchmakingStatusPayload): void {
    if (this.currentRoomId) return; // Ignore if already in room

    if (payload.status === 'QUEUED') {
      this.collectionWindowActive = false;
      this.queuePosition = payload.position;
      this.totalWaiting = payload.totalWaiting;
      this.statusBannerText = `SEARCHING FOR RACERS • POSITION #${payload.position} • WAITING (${payload.totalWaiting}/8)`;
    } else if (payload.status === 'COLLECTION_WINDOW') {
      this.collectionWindowActive = true;
      this.queuePosition = payload.position;
      this.totalWaiting = payload.totalWaiting;
      this.collectionRemainingSec = payload.collectionTimeRemainingSec ?? 15;
      this.statusBannerText = `MATCH STARTING IN ${this.collectionRemainingSec}s • RACERS GATHERING (${payload.totalWaiting}/8)`;
    } else if (payload.status === 'CANCELLED') {
      this.inQueue = false;
      this.collectionWindowActive = false;
      this.statusBannerText = 'MATCHMAKING CANCELLED';
    }
  }

  public handleRoomAssigned(payload: RoomAssignedPayload): void {
    this.inQueue = false;
    this.collectionWindowActive = false;
    this.currentRoomId = payload.roomId;
    this.currentTrackId = payload.trackId;
    this.localSlotId = payload.slotId;

    this.slots = new Array(8).fill(null);
    payload.players.forEach((p) => {
      const num = parseInt(p.slot.replace(/\D/g, ''), 10);
      const idx = isNaN(num) ? -1 : num - 1;
      if (idx >= 0 && idx < 8) {
        this.slots[idx] = p;
        if (p.id === this.localPlayerId || (this.localSlotId && p.slot.toUpperCase() === this.localSlotId.toUpperCase())) {
          this.localPlayerId = p.id;
          this.isReady = p.isReady;
        }
      }
    });

    this.statusBannerText = `ROOM #${payload.roomId.toUpperCase()} // ${payload.trackId.toUpperCase()} // SLOT: ${this.localSlotId}`;
  }

  public toggleReady(): boolean {
    if (!this.currentRoomId) {
      // Cannot ready up while waiting in queue
      return false;
    }
    this.isReady = !this.isReady;
    return true;
  }
}

describe('Milestone 8.5 — Frontend Matchmaking Protocol & Scene Integration', () => {

  it('NetworkManager transmits JOIN_MATCHMAKING and CANCEL_MATCHMAKING frames conforming to protocol', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    // 1. Join matchmaking without roomId (global queue)
    const joinOk = net.joinMatchmaking({
      preferredTrackId: 'desert-heat',
      preferredCarId: 'viper-r',
    });
    assert.strictEqual(joinOk, true);

    const sentJoin = JSON.parse(mockSocket.sentMessages[mockSocket.sentMessages.length - 1]);
    assert.strictEqual(sentJoin.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual(sentJoin.type, MessageType.JOIN_MATCHMAKING);
    assert.strictEqual(sentJoin.payload.preferredTrackId, 'desert-heat');
    assert.strictEqual(sentJoin.payload.preferredCarId, 'viper-r');
    assert.strictEqual(sentJoin.payload.roomId, undefined);

    // 2. Cancel matchmaking without roomId
    const cancelOk = net.cancelMatchmaking();
    assert.strictEqual(cancelOk, true);

    const sentCancel = JSON.parse(mockSocket.sentMessages[mockSocket.sentMessages.length - 1]);
    assert.strictEqual(sentCancel.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual(sentCancel.type, MessageType.CANCEL_MATCHMAKING);
    assert.strictEqual(sentCancel.payload.roomId, undefined);
  });

  it('NetworkManager dispatches MATCHMAKING_STATUS envelopes to subscribers', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    let receivedPayload: MatchmakingStatusPayload | null = null;
    net.on(MessageType.MATCHMAKING_STATUS, (payload) => {
      receivedPayload = payload;
    });

    // Simulate incoming server envelope
    const serverEnvelope = JSON.stringify({
      protocolVersion: '1.0',
      type: 'MATCHMAKING_STATUS',
      timestamp: Date.now(),
      payload: {
        status: 'COLLECTION_WINDOW',
        position: 2,
        totalWaiting: 3,
        collectionTimeRemainingSec: 12,
        minPlayers: 2,
        maxPlayers: 8,
      },
    });

    (net as any).handleSocketMessage(serverEnvelope);

    assert.notStrictEqual(receivedPayload, null);
    assert.strictEqual(receivedPayload!.status, 'COLLECTION_WINDOW');
    assert.strictEqual(receivedPayload!.position, 2);
    assert.strictEqual(receivedPayload!.totalWaiting, 3);
    assert.strictEqual(receivedPayload!.collectionTimeRemainingSec, 12);
  });

  it('Scene model updates state accurately across QUEUED, COLLECTION_WINDOW, and CANCELLED', () => {
    const scene = new MatchmakingSceneModel();
    scene.enterQueue();

    assert.strictEqual(scene.inQueue, true);
    assert.strictEqual(scene.currentRoomId, null);

    // 1. Single player queued
    scene.handleMatchmakingStatus({
      status: 'QUEUED',
      position: 1,
      totalWaiting: 1,
      collectionTimeRemainingSec: 0,
      minPlayers: 2,
      maxPlayers: 8,
    });
    assert.strictEqual(scene.queuePosition, 1);
    assert.strictEqual(scene.totalWaiting, 1);
    assert.strictEqual(scene.collectionWindowActive, false);
    assert.match(scene.statusBannerText, /POSITION #1/);

    // 2. Collection window begins on 2nd player
    scene.handleMatchmakingStatus({
      status: 'COLLECTION_WINDOW',
      position: 1,
      totalWaiting: 2,
      collectionTimeRemainingSec: 15,
      minPlayers: 2,
      maxPlayers: 8,
    });
    assert.strictEqual(scene.collectionWindowActive, true);
    assert.strictEqual(scene.totalWaiting, 2);
    assert.strictEqual(scene.collectionRemainingSec, 15);
    assert.match(scene.statusBannerText, /MATCH STARTING IN 15s/);

    // 3. Cancellation resets queue state
    scene.handleMatchmakingStatus({
      status: 'CANCELLED',
      position: 0,
      totalWaiting: 0,
      collectionTimeRemainingSec: 0,
      minPlayers: 2,
      maxPlayers: 8,
    });
    assert.strictEqual(scene.inQueue, false);
    assert.strictEqual(scene.collectionWindowActive, false);
    assert.strictEqual(scene.statusBannerText, 'MATCHMAKING CANCELLED');
  });

  it('Prevents toggleReady while waiting in queue, and enables it upon ROOM_ASSIGNED', () => {
    const scene = new MatchmakingSceneModel();
    scene.enterQueue();

    // In queue, toggleReady must return false and remain unready
    assert.strictEqual(scene.toggleReady(), false);
    assert.strictEqual(scene.isReady, false);

    // Receive ROOM_ASSIGNED from server
    scene.handleRoomAssigned({
      roomId: 'room-match-101',
      trackId: 'coastal-rush',
      slotId: 'P1',
      maxLaps: 3,
      players: [
        { id: 'p1', name: 'Racer1', carId: 'bolt-gt', slot: 'P1', isReady: false },
        { id: 'p2', name: 'Racer2', carId: 'viper-r', slot: 'P2', isReady: false },
      ],
    });

    assert.strictEqual(scene.currentRoomId, 'room-match-101');
    assert.strictEqual(scene.inQueue, false);

    // Now in room, toggleReady succeeds
    assert.strictEqual(scene.toggleReady(), true);
    assert.strictEqual(scene.isReady, true);

    // Toggle off
    assert.strictEqual(scene.toggleReady(), true);
    assert.strictEqual(scene.isReady, false);
  });
});
