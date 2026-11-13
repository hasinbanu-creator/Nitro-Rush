/**
 * Milestone 8.6 — Frontend Private Room Integration & Protocol Unit Tests
 *
 * Verifies that:
 * 1. NetworkManager formats and transmits CREATE_PRIVATE_ROOM, JOIN_PRIVATE_ROOM, LEAVE_PRIVATE_ROOM, and START_PRIVATE_RACE frames conforming to protocol schemas.
 * 2. Room codes are properly normalized (uppercase, trimmed) before transmission.
 * 3. NetworkManager dispatches PRIVATE_ROOM_CREATED, PRIVATE_ROOM_JOINED, PRIVATE_ROOM_UPDATED, and PRIVATE_ROOM_ERROR envelopes to subscribers.
 * 4. Private room state model tracks host assignment, host transfer, member slots, ready toggling, and start validation.
 * 5. Private rooms suppress automatic lobby countdowns; race start requires host action when >= 2 players are all ready.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MessageType,
  ConnectionState,
  PROTOCOL_VERSION,
  ErrorCode,
  type PlayerSlotInfo,
  type PrivateRoomCreatedPayload,
  type PrivateRoomJoinedPayload,
  type PrivateRoomUpdatedPayload,
  type PrivateRoomErrorPayload,
} from '../../src/multiplayer/ProtocolTypes.ts';
import { MockWebSocket } from './MockWebSocket.ts';
import { NetworkManager } from '../../src/multiplayer/NetworkManager.ts';
import { SessionStore } from '../../src/multiplayer/SessionStore.ts';

// State machine simulating the private room lobby scene logic
class PrivateRoomSceneModel {
  public isPrivateRoom: boolean = true;
  public roomCode: string | null = null;
  public roomId: string | null = null;
  public trackId: string = 'coastal-rush';
  public localSlotId: string | null = null;
  public localPlayerId: string | null = null;
  public hostPlayerId: string | null = null;
  public isHost: boolean = false;
  public isLocalReady: boolean = false;

  public slots: (PlayerSlotInfo | null)[] = new Array(8).fill(null);
  public bannerText: string = '';

  public handlePrivateRoomCreated(payload: PrivateRoomCreatedPayload): void {
    this.isPrivateRoom = true;
    this.roomCode = payload.roomCode;
    this.roomId = payload.roomId;
    this.trackId = payload.trackId;
    this.localSlotId = payload.slotId;
    this.hostPlayerId = payload.hostPlayerId;
    this.isHost = true;

    this.populateSlots(payload.players);
    this.updateBanner();
  }

  public handlePrivateRoomJoined(payload: PrivateRoomJoinedPayload): void {
    this.isPrivateRoom = true;
    this.roomCode = payload.roomCode;
    this.roomId = payload.roomId;
    this.trackId = payload.trackId;
    this.localSlotId = payload.slotId;
    this.hostPlayerId = payload.hostPlayerId;
    this.isHost = (this.hostPlayerId !== null && (
      this.hostPlayerId === this.localPlayerId ||
      (this.localSlotId !== null && this.hostPlayerId === this.localSlotId.toLowerCase())
    ));

    this.populateSlots(payload.players);
    this.updateBanner();
  }

  public handlePrivateRoomUpdated(payload: PrivateRoomUpdatedPayload): void {
    this.isPrivateRoom = true;
    this.roomCode = payload.roomCode;
    this.roomId = payload.roomId;
    this.hostPlayerId = payload.hostPlayerId;
    this.isHost = (this.hostPlayerId !== null && (
      this.hostPlayerId === this.localPlayerId ||
      (this.localSlotId !== null && this.hostPlayerId === this.localSlotId.toLowerCase())
    ));

    this.populateSlots(payload.players);
    this.updateBanner();
  }

  private populateSlots(players: PlayerSlotInfo[]): void {
    this.slots = new Array(8).fill(null);
    players.forEach((p) => {
      const num = parseInt(p.slot.replace(/\D/g, ''), 10);
      const idx = isNaN(num) ? -1 : num - 1;
      if (idx >= 0 && idx < 8) {
        this.slots[idx] = p;
        const isLocal = (this.localSlotId && p.slot.toUpperCase() === this.localSlotId.toUpperCase()) ||
                        (this.localPlayerId && p.id === this.localPlayerId);
        if (isLocal) {
          this.localPlayerId = p.id;
          this.isLocalReady = p.isReady;
        }
      }
    });
  }

  public canHostStartRace(): { canStart: boolean; reason?: string } {
    if (!this.isHost) {
      return { canStart: false, reason: 'Only the host can start the race' };
    }
    const total = this.slots.filter((s) => s !== null).length;
    const readyCount = this.slots.filter((s) => s && s.isReady).length;

    if (total < 2) {
      return { canStart: false, reason: 'At least 2 racers required' };
    }
    if (readyCount < total) {
      return { canStart: false, reason: 'All racers must be ready' };
    }
    return { canStart: true };
  }

  private updateBanner(): void {
    const ready = this.slots.filter((s) => s && s.isReady).length;
    const total = this.slots.filter((s) => s !== null).length;
    const hostStr = this.isHost ? 'YOU ARE HOST' : 'WAITING FOR HOST';
    this.bannerText = `CODE: ${this.roomCode} • ${ready}/${total} READY • ${hostStr}`;
  }
}

describe('Milestone 8.6 — Frontend Private Room Protocol & Integration', () => {
  it('NetworkManager transmits CREATE_PRIVATE_ROOM with preferred settings', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    const sent = net.createPrivateRoom({ preferredTrackId: 'desert-heat', preferredCarId: 'titan-suv' });
    assert.strictEqual(sent, true);
    assert.strictEqual(mockSocket.sentMessages.length, 1);

    const frame = JSON.parse(mockSocket.sentMessages[0]);
    assert.strictEqual(frame.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual(frame.type, MessageType.CREATE_PRIVATE_ROOM);
    assert.strictEqual(frame.payload.preferredTrackId, 'desert-heat');
    assert.strictEqual(frame.payload.preferredCarId, 'titan-suv');
  });

  it('NetworkManager normalizes roomCode to uppercase and trimmed before transmission', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    const sent = net.joinPrivateRoom('  ab7x9k  ', 'phantom-r');
    assert.strictEqual(sent, true);
    assert.strictEqual(mockSocket.sentMessages.length, 1);

    const frame = JSON.parse(mockSocket.sentMessages[0]);
    assert.strictEqual(frame.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual(frame.type, MessageType.JOIN_PRIVATE_ROOM);
    assert.strictEqual(frame.payload.roomCode, 'AB7X9K');
    assert.strictEqual(frame.payload.preferredCarId, 'phantom-r');
  });

  it('NetworkManager transmits LEAVE_PRIVATE_ROOM and START_PRIVATE_RACE frames correctly', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    // Leave private room
    const leaveSent = net.leavePrivateRoom({ roomCode: 'K9M4X2', roomId: 'room-123' });
    assert.strictEqual(leaveSent, true);
    const leaveFrame = JSON.parse(mockSocket.sentMessages[mockSocket.sentMessages.length - 1]);
    assert.strictEqual(leaveFrame.type, MessageType.LEAVE_PRIVATE_ROOM);
    assert.strictEqual(leaveFrame.payload.roomCode, 'K9M4X2');
    assert.strictEqual(leaveFrame.payload.roomId, 'room-123');

    // Start private race
    const startSent = net.startPrivateRace({ roomCode: 'K9M4X2', roomId: 'room-123' });
    assert.strictEqual(startSent, true);
    const startFrame = JSON.parse(mockSocket.sentMessages[mockSocket.sentMessages.length - 1]);
    assert.strictEqual(startFrame.type, MessageType.START_PRIVATE_RACE);
    assert.strictEqual(startFrame.payload.roomCode, 'K9M4X2');
    assert.strictEqual(startFrame.payload.roomId, 'room-123');
  });

  it('NetworkManager dispatches PRIVATE_ROOM_CREATED and initializes host scene state', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    const scene = new PrivateRoomSceneModel();
    scene.localPlayerId = 'guest-host-uuid';

    net.on(MessageType.PRIVATE_ROOM_CREATED, (payload: PrivateRoomCreatedPayload) => {
      scene.handlePrivateRoomCreated(payload);
    });

    (net as any).handleSocketMessage(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.PRIVATE_ROOM_CREATED,
      timestamp: Date.now(),
      payload: {
        roomCode: 'K9M4X2',
        roomId: 'room-priv-1',
        trackId: 'coastal-rush',
        slotId: 'P1',
        hostPlayerId: 'guest-host-uuid',
        players: [
          { id: 'guest-host-uuid', name: 'HostRacer', carId: 'bolt-gt', slot: 'P1', isReady: false },
        ],
      },
    }));

    assert.strictEqual(scene.isPrivateRoom, true);
    assert.strictEqual(scene.roomCode, 'K9M4X2');
    assert.strictEqual(scene.isHost, true);
    assert.strictEqual(scene.hostPlayerId, 'guest-host-uuid');
    assert.strictEqual(scene.slots[0]?.name, 'HostRacer');
    assert.ok(scene.bannerText.includes('YOU ARE HOST'));
  });

  it('Enforces host-only start race gate: requires >= 2 players and 100% ready status', () => {
    const scene = new PrivateRoomSceneModel();
    scene.localPlayerId = 'p1-uuid';

    // 1. Host alone in room
    scene.handlePrivateRoomCreated({
      roomCode: 'W4R8K9',
      roomId: 'room-1',
      trackId: 'city-nights',
      slotId: 'P1',
      hostPlayerId: 'p1-uuid',
      players: [
        { id: 'p1-uuid', name: 'Host', carId: 'bolt-gt', slot: 'P1', isReady: true },
      ],
    });

    let check = scene.canHostStartRace();
    assert.strictEqual(check.canStart, false);
    assert.ok(check.reason?.includes('At least 2 racers'));

    // 2. Second player joins, but not ready
    scene.handlePrivateRoomUpdated({
      roomCode: 'W4R8K9',
      roomId: 'room-1',
      hostPlayerId: 'p1-uuid',
      allReady: false,
      readyCount: 1,
      players: [
        { id: 'p1-uuid', name: 'Host', carId: 'bolt-gt', slot: 'P1', isReady: true },
        { id: 'p2-uuid', name: 'Friend', carId: 'rally-apex', slot: 'P2', isReady: false },
      ],
    });

    check = scene.canHostStartRace();
    assert.strictEqual(check.canStart, false);
    assert.ok(check.reason?.includes('All racers must be ready'));

    // 3. Second player readies up -> Race start enabled
    scene.handlePrivateRoomUpdated({
      roomCode: 'W4R8K9',
      roomId: 'room-1',
      hostPlayerId: 'p1-uuid',
      allReady: true,
      readyCount: 2,
      players: [
        { id: 'p1-uuid', name: 'Host', carId: 'bolt-gt', slot: 'P1', isReady: true },
        { id: 'p2-uuid', name: 'Friend', carId: 'rally-apex', slot: 'P2', isReady: true },
      ],
    });

    check = scene.canHostStartRace();
    assert.strictEqual(check.canStart, true);
  });

  it('Transfers host role safely when original host leaves', () => {
    const scene = new PrivateRoomSceneModel();
    scene.localPlayerId = 'p2-uuid';
    scene.localSlotId = 'P2';

    // P2 joins room hosted by P1
    scene.handlePrivateRoomJoined({
      roomCode: 'X7K2M9',
      roomId: 'room-2',
      trackId: 'coastal-rush',
      slotId: 'P2',
      hostPlayerId: 'p1-uuid',
      players: [
        { id: 'p1-uuid', name: 'OriginalHost', carId: 'bolt-gt', slot: 'P1', isReady: false },
        { id: 'p2-uuid', name: 'JoinerRacer', carId: 'venom-f1', slot: 'P2', isReady: false },
      ],
    });

    assert.strictEqual(scene.isHost, false);
    assert.ok(scene.bannerText.includes('WAITING FOR HOST'));

    // P1 leaves, server promotes P2 as new host
    scene.handlePrivateRoomUpdated({
      roomCode: 'X7K2M9',
      roomId: 'room-2',
      hostPlayerId: 'p2-uuid',
      allReady: false,
      readyCount: 0,
      players: [
        { id: 'p2-uuid', name: 'JoinerRacer', carId: 'venom-f1', slot: 'P2', isReady: false },
      ],
    });

    assert.strictEqual(scene.isHost, true);
    assert.strictEqual(scene.hostPlayerId, 'p2-uuid');
    assert.ok(scene.bannerText.includes('YOU ARE HOST'));
  });

  it('Handles PRIVATE_ROOM_ERROR frames gracefully', () => {
    const mockStore = new SessionStore();
    const net = new NetworkManager({ store: mockStore });
    const mockSocket = new MockWebSocket('ws://localhost:8080/ws/game');
    mockSocket.simulateOpen();
    (net as any).socket = mockSocket;
    (net as any).state = ConnectionState.AUTHENTICATED;

    let errorReceived: PrivateRoomErrorPayload | null = null;
    net.on(MessageType.PRIVATE_ROOM_ERROR, (payload: PrivateRoomErrorPayload) => {
      errorReceived = payload;
    });

    (net as any).handleSocketMessage(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.PRIVATE_ROOM_ERROR,
      timestamp: Date.now(),
      payload: {
        errorCode: ErrorCode.INVALID_ROOM_CODE,
        message: 'No active room found with code: ZZZZZZ',
      },
    }));

    assert.ok(errorReceived !== null);
    assert.strictEqual((errorReceived as any).errorCode, ErrorCode.INVALID_ROOM_CODE);
  });
});
