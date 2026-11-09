/**
 * Comprehensive Unit Tests for Nitro Rush NetworkManager
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { NetworkManager } from '../../src/multiplayer/NetworkManager.ts';
import {
  MessageType,
  ConnectionState,
  PROTOCOL_VERSION,
  type MessageEnvelope,
  type ConnectionAcceptedPayload,
  type AuthenticationResultPayload,
  type PongPayload,
} from '../../src/multiplayer/ProtocolTypes.ts';
import { SessionStore } from '../../src/multiplayer/SessionStore.ts';
import { MockWebSocket } from './MockWebSocket.ts';

// In-memory localStorage mock for node environment
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('NetworkManager Unit Tests', () => {
  let mockSocket: MockWebSocket;
  let manager: NetworkManager;
  let testStore: SessionStore;

  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: new MockLocalStorage(),
      location: { protocol: 'http:', hostname: 'localhost' },
    };

    testStore = new SessionStore();
    testStore.clearSession();

    manager = new NetworkManager({
      wsUrl: 'ws://localhost:8080/ws/game',
      heartbeatIntervalMs: 500, // fast interval for testing
      connectTimeoutMs: 1000,
      authTimeoutMs: 1000,
      store: testStore,
      webSocketFactory: (url: string) => {
        mockSocket = new MockWebSocket(url);
        return mockSocket as unknown as WebSocket;
      },
    });
  });

  afterEach(() => {
    manager.disconnect();
    manager.removeAllListeners();
    NetworkManager.resetInstance();
  });

  // ==========================================================================
  // 1. Connection & Handshake
  // ==========================================================================

  it('establishes connection and processes CONNECTION_ACCEPTED handshake', async () => {
    assert.strictEqual(manager.getState(), ConnectionState.DISCONNECTED);

    const connectPromise = manager.connect();
    assert.strictEqual(manager.getState(), ConnectionState.CONNECTING);

    // Simulate socket open
    mockSocket.simulateOpen();

    // Simulate server welcome envelope
    const welcomePayload: ConnectionAcceptedPayload = {
      sessionId: 'sess-abc-123',
      heartbeatIntervalMs: 10000,
    };
    const welcomeEnvelope: MessageEnvelope<ConnectionAcceptedPayload> = {
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: welcomePayload,
    };
    mockSocket.simulateMessage(welcomeEnvelope);

    const result = await connectPromise;
    assert.strictEqual(result.sessionId, 'sess-abc-123');
    assert.strictEqual(manager.getState(), ConnectionState.CONNECTED);
    assert.strictEqual(manager.getSessionId(), 'sess-abc-123');
    assert.strictEqual(manager.isConnected(), true);
  });

  it('prevents duplicate connections when already connecting or connected', async () => {
    const promise1 = manager.connect();
    const promise2 = manager.connect();

    // Calling connect again returns the same in-flight promise
    assert.strictEqual(promise1, promise2);

    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-dup-test', heartbeatIntervalMs: 10000 },
    });

    const res1 = await promise1;
    const res2 = await manager.connect(); // Calling connect when already connected

    assert.strictEqual(res1.sessionId, 'sess-dup-test');
    assert.strictEqual(res2.sessionId, 'sess-dup-test');
  });

  // ==========================================================================
  // 2. Guest Authentication Flow
  // ==========================================================================

  it('authenticates guest successfully and saves session to SessionStore', async () => {
    // 1. Connect
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-auth-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    // 2. Authenticate
    mockSocket.clearSent();
    const authPromise = manager.authenticateGuest('ApexRacer');
    assert.strictEqual(manager.getState(), ConnectionState.AUTHENTICATING);

    // Verify outbound envelope
    const sent = mockSocket.getSentEnvelopes();
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].type, MessageType.AUTHENTICATE_GUEST);
    assert.strictEqual(sent[0].payload.displayName, 'ApexRacer');

    // Simulate backend response
    const authResult: AuthenticationResultPayload = {
      success: true,
      guestToken: 'uuid-tok-7890',
      displayName: 'ApexRacer',
    };
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.AUTHENTICATION_RESULT,
      timestamp: Date.now(),
      payload: authResult,
    });

    const res = await authPromise;
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.guestToken, 'uuid-tok-7890');
    assert.strictEqual(manager.getState(), ConnectionState.AUTHENTICATED);
    assert.strictEqual(manager.isAuthenticated(), true);

    // Verify saved to store
    assert.strictEqual(testStore.getGuestToken(), 'uuid-tok-7890');
    assert.strictEqual(testStore.getDisplayName(), 'ApexRacer');
  });

  it('rejects authentication with invalid display name length without sending message', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-name-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    mockSocket.clearSent();
    await assert.rejects(
      async () => {
        await manager.authenticateGuest('A'); // < 2 chars
      },
      { message: 'Display name must be between 2 and 16 characters' }
    );
    assert.strictEqual(mockSocket.sentMessages.length, 0);

    await assert.rejects(
      async () => {
        await manager.authenticateGuest('ThisNameIsWayTooLongForNitroRush'); // > 16 chars
      },
      { message: 'Display name must be between 2 and 16 characters' }
    );
    assert.strictEqual(mockSocket.sentMessages.length, 0);
  });

  it('handles server authentication rejection (success: false)', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-reject-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    const authPromise = manager.authenticateGuest('BadPlayer');

    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.AUTHENTICATION_RESULT,
      timestamp: Date.now(),
      payload: {
        success: false,
        guestToken: '',
        displayName: 'BadPlayer',
      },
    });

    await assert.rejects(async () => {
      await authPromise;
    }, { message: 'Authentication rejected by server' });

    assert.strictEqual(manager.getState(), ConnectionState.CONNECTED);
    assert.strictEqual(manager.isAuthenticated(), false);
  });

  // ==========================================================================
  // 3. Heartbeat PING/PONG & RTT Calculation
  // ==========================================================================

  it('sends PING and calculates RTT accurately upon receiving PONG', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-ping-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    mockSocket.clearSent();

    let latencyEventRtt = -1;
    manager.onLatency((rtt) => {
      latencyEventRtt = rtt;
    });

    // Simulate sending ping with timestamp 50ms in the past
    const simulatedClientTime = Date.now() - 42;
    const pongPayload: PongPayload = {
      clientTimestamp: simulatedClientTime,
      serverTimestamp: Date.now() - 21,
    };

    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.PONG,
      timestamp: Date.now(),
      payload: pongPayload,
    });

    const latency = manager.getLatency();
    assert.ok(latency.currentRttMs >= 40, `Expected RTT >= 40ms, got ${latency.currentRttMs}`);
    assert.strictEqual(latencyEventRtt, latency.currentRttMs);
    assert.ok(latency.smoothedRttMs > 0);
  });

  // ==========================================================================
  // 4. Robustness: Malformed JSON, Unknown Messages & Server Errors
  // ==========================================================================

  it('handles malformed incoming JSON gracefully without throwing uncaught exceptions', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-malformed-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    let errorObserved = false;
    manager.onError((err) => {
      if (err.code === 'MALFORMED_JSON') {
        errorObserved = true;
      }
    });

    // Send broken JSON
    mockSocket.simulateMessage('INVALID_JSON_FRAME_{{{');

    assert.strictEqual(errorObserved, true);
    // Manager should remain connected and operational
    assert.strictEqual(manager.isConnected(), true);
  });

  it('handles server protocol ERROR envelopes by emitting error event', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-err-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    let serverErrorCaptured: any = null;
    manager.onError((err) => {
      serverErrorCaptured = err;
    });

    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.ERROR,
      timestamp: Date.now(),
      payload: {
        errorCode: 'ROOM_FULL',
        message: 'The requested room has reached maximum 8 racer capacity',
      },
    });

    assert.ok(serverErrorCaptured);
    assert.strictEqual(serverErrorCaptured.code, 'ROOM_FULL');
    assert.strictEqual(
      serverErrorCaptured.message,
      'The requested room has reached maximum 8 racer capacity'
    );
  });

  // ==========================================================================
  // 5. Connection Closure & Disconnect
  // ==========================================================================

  it('updates state to DISCONNECTED when socket is closed', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-close-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    let stateChanges: ConnectionState[] = [];
    manager.onStateChange((state) => {
      stateChanges.push(state);
    });

    // Simulate unexpected server disconnect
    mockSocket.simulateClose(1006, 'Abnormal Closure');

    assert.strictEqual(manager.getState(), ConnectionState.DISCONNECTED);
    assert.strictEqual(manager.isConnected(), false);
    assert.strictEqual(manager.getSessionId(), null);
    assert.ok(stateChanges.includes(ConnectionState.DISCONNECTED));
  });

  it('disconnects gracefully on client call', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-graceful-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    manager.disconnect();

    assert.strictEqual(manager.getState(), ConnectionState.DISCONNECTED);
    assert.strictEqual(mockSocket.readyState, MockWebSocket.CLOSED);
  });

  // ==========================================================================
  // 6. Typed Event Subscriptions & Cleanup
  // ==========================================================================

  it('dispatches typed messages, prevents duplicate listeners, and unregisters cleanly', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-events-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    let callCount = 0;
    const testHandler = () => {
      callCount++;
    };

    // Register twice with exact same handler reference
    const unsubscribe1 = manager.on(MessageType.COUNTDOWN_STARTED, testHandler);
    const unsubscribe2 = manager.on(MessageType.COUNTDOWN_STARTED, testHandler);

    // Send COUNTDOWN_STARTED message
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.COUNTDOWN_STARTED,
      timestamp: Date.now(),
      payload: { durationSeconds: 3 },
    });

    // Should only be called ONCE due to Set-based deduplication
    assert.strictEqual(callCount, 1);

    // Unsubscribe via returned function
    unsubscribe1();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.COUNTDOWN_STARTED,
      timestamp: Date.now(),
      payload: { durationSeconds: 3 },
    });

    assert.strictEqual(callCount, 1); // Still 1, did not fire again
  });

  it('supports once() subscription that fires exactly once', async () => {
    const connectPromise = manager.connect();
    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      payload: { sessionId: 'sess-once-test', heartbeatIntervalMs: 10000 },
    });
    await connectPromise;

    let firedTimes = 0;
    manager.once(MessageType.RACE_STARTED, () => {
      firedTimes++;
    });

    // Dispatch message twice
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.RACE_STARTED,
      timestamp: Date.now(),
      payload: { serverTimestamp: Date.now() },
    });
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.RACE_STARTED,
      timestamp: Date.now(),
      payload: { serverTimestamp: Date.now() },
    });

    assert.strictEqual(firedTimes, 1);
  });

  it('removeAllListeners clears all registered event subscriptions', async () => {
    let messageFired = false;
    let stateFired = false;

    manager.on(MessageType.RACE_STARTED, () => {
      messageFired = true;
    });
    manager.onStateChange(() => {
      stateFired = true;
    });

    manager.removeAllListeners();

    mockSocket.simulateOpen();
    mockSocket.simulateMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: MessageType.RACE_STARTED,
      timestamp: Date.now(),
      payload: { serverTimestamp: Date.now() },
    });

    assert.strictEqual(messageFired, false);
  });
});

