/**
 * Nitro Rush Multiplayer Network Manager
 *
 * Authoritative WebSocket connection manager implementing Protocol v1.0.
 * Handles socket lifecycle, guest authentication, 10s heartbeat with RTT calculation,
 * typed message dispatching, duplicate connection prevention, and safe event cleanup.
 */

import {
  PROTOCOL_VERSION,
  MessageType,
  ConnectionState,
  type MessageEnvelope,
  type PayloadMap,
  type ConnectionAcceptedPayload,
  type AuthenticateGuestPayload,
  type AuthenticationResultPayload,
  type PingPayload,
  type PongPayload,
  type ErrorPayload,
} from './ProtocolTypes.ts';
import { SessionStore, sessionStore } from './SessionStore.ts';

export interface NetworkError {
  code: string;
  message: string;
  originalError?: unknown;
}

export type MessageHandler<T = unknown> = (payload: T, envelope: MessageEnvelope<T>) => void;
export type StateChangeHandler = (state: ConnectionState, previousState: ConnectionState) => void;
export type ErrorHandler = (error: NetworkError) => void;
export type LatencyHandler = (currentRttMs: number, smoothedRttMs: number) => void;

export interface NetworkManagerOptions {
  wsUrl?: string;
  heartbeatIntervalMs?: number;
  connectTimeoutMs?: number;
  authTimeoutMs?: number;
  store?: SessionStore;
  webSocketFactory?: (url: string) => WebSocket;
}

export class NetworkManager {
  private static instance: NetworkManager | null = null;

  private wsUrl: string;
  private socket: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private store: SessionStore;

  // Configuration & timing
  private heartbeatIntervalMs: number = 10000;
  private connectTimeoutMs: number = 8000;
  private authTimeoutMs: number = 10000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private webSocketFactory: (url: string) => WebSocket;

  // Metrics
  private currentRttMs: number = 0;
  private smoothedRttMs: number = 0;
  private lastPingSentAt: number = 0;

  // Session data
  private sessionId: string | null = null;
  private currentGuestToken: string | null = null;
  private currentDisplayName: string | null = null;

  // In-flight connection & auth promises
  private connectPromise: Promise<ConnectionAcceptedPayload> | null = null;
  private authPromiseResolve: ((value: AuthenticationResultPayload) => void) | null = null;
  private authPromiseReject: ((reason: Error) => void) | null = null;
  private authTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Event listener registries (using Sets to guarantee NO duplicate subscriptions)
  private messageListeners = new Map<MessageType, Set<MessageHandler<any>>>();
  private stateListeners = new Set<StateChangeHandler>();
  private errorListeners = new Set<ErrorHandler>();
  private latencyListeners = new Set<LatencyHandler>();

  constructor(options: NetworkManagerOptions = {}) {
    this.wsUrl = options.wsUrl || this.getDefaultWebSocketUrl();
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 10000;
    this.connectTimeoutMs = options.connectTimeoutMs || 8000;
    this.authTimeoutMs = options.authTimeoutMs || 10000;
    this.store = options.store || sessionStore;
    this.webSocketFactory = options.webSocketFactory || ((url: string) => new WebSocket(url));

    // Restore guest session token if stored
    this.currentGuestToken = this.store.getGuestToken();
    this.currentDisplayName = this.store.getDisplayName();
  }

  /**
   * Singleton accessor for application-wide network manager.
   */
  public static getInstance(options?: NetworkManagerOptions): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager(options);
    }
    return NetworkManager.instance;
  }

  /**
   * Resets singleton instance (useful for unit tests).
   */
  public static resetInstance(): void {
    if (NetworkManager.instance) {
      NetworkManager.instance.disconnect();
      NetworkManager.instance = null;
    }
  }

  // ==========================================================================
  // Connection Lifecycle
  // ==========================================================================

  /**
   * Establishes a WebSocket connection to the game server.
   * If already connected, returns immediately.
   * If already connecting, reuses existing in-flight promise to prevent duplicates.
   */
  public connect(overrideUrl?: string): Promise<ConnectionAcceptedPayload> {
    if (overrideUrl) {
      this.wsUrl = overrideUrl;
    }

    // 1. Check if already connected and welcomed
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.AUTHENTICATED) {
      if (this.sessionId) {
        return Promise.resolve({
          sessionId: this.sessionId,
          heartbeatIntervalMs: this.heartbeatIntervalMs,
        });
      }
    }

    // 2. Prevent duplicate concurrent connection attempts
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<ConnectionAcceptedPayload>((resolve, reject) => {
      this.setState(ConnectionState.CONNECTING);

      let connectTimeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        this.connectPromise = null;
      };

      connectTimeout = setTimeout(() => {
        cleanup();
        this.emitError('CONNECTION_TIMEOUT', `Connection to ${this.wsUrl} timed out after ${this.connectTimeoutMs}ms`);
        this.disconnect();
        reject(new Error(`Connection to ${this.wsUrl} timed out`));
      }, this.connectTimeoutMs);

      try {
        this.socket = this.webSocketFactory(this.wsUrl);
      } catch (err) {
        cleanup();
        this.setState(ConnectionState.DISCONNECTED);
        this.emitError('SOCKET_CREATION_FAILED', 'Failed to instantiate WebSocket', err);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.socket.onopen = () => {
        // Connected to socket; waiting for server CONNECTION_ACCEPTED envelope
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.handleSocketMessage(event.data, (welcome) => {
          cleanup();
          resolve(welcome);
        });
      };

      this.socket.onerror = (event: Event) => {
        this.emitError('SOCKET_ERROR', 'WebSocket transport error observed', event);
      };

      this.socket.onclose = (event: CloseEvent) => {
        cleanup();
        this.handleSocketClose(event);
        if (this.state === ConnectionState.CONNECTING) {
          reject(new Error(`WebSocket closed before handshake completed (code: ${event.code}, reason: ${event.reason || 'none'})`));
        }
      };
    });

    return this.connectPromise;
  }

  /**
   * Gracefully closes the active connection and terminates all timers.
   */
  public disconnect(code: number = 1000, reason: string = 'Normal Closure'): void {
    this.stopHeartbeat();
    this.cleanupAuthPromise(new Error('Connection disconnected by client'));

    if (this.socket) {
      // Remove listeners before closing to prevent triggering redundant onClose handlers
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      const closingSocket = this.socket;
      this.socket = null;

      if (
        closingSocket.readyState === WebSocket.OPEN ||
        closingSocket.readyState === WebSocket.CONNECTING
      ) {
        try {
          closingSocket.close(code, reason);
        } catch {
          // Ignore close exceptions
        }
      }
    }

    this.sessionId = null;
    this.setState(ConnectionState.DISCONNECTED);
  }

  // ==========================================================================
  // Guest Authentication Flow
  // ==========================================================================

  /**
   * Authenticates as a guest user using the server's AUTHENTICATE_GUEST protocol.
   * Reuses stored guestToken if available, or generates a new session.
   */
  public async authenticateGuest(
    displayName: string,
    requestedToken?: string,
    avatarId?: string
  ): Promise<AuthenticationResultPayload> {
    const cleanName = (displayName || '').trim();
    if (cleanName.length < 2 || cleanName.length > 16) {
      throw new Error('Display name must be between 2 and 16 characters');
    }

    if (this.state !== ConnectionState.CONNECTED && this.state !== ConnectionState.AUTHENTICATED) {
      throw new Error(`Cannot authenticate in state '${this.state}'. Connect first.`);
    }

    const tokenToSend = requestedToken || this.currentGuestToken || undefined;

    this.setState(ConnectionState.AUTHENTICATING);

    return new Promise<AuthenticationResultPayload>((resolve, reject) => {
      this.cleanupAuthPromise(new Error('Overwritten by new authentication request'));

      this.authPromiseResolve = resolve;
      this.authPromiseReject = reject;

      this.authTimeoutTimer = setTimeout(() => {
        this.cleanupAuthPromise(new Error(`Authentication timed out after ${this.authTimeoutMs}ms`));
        this.setState(ConnectionState.CONNECTED);
      }, this.authTimeoutMs);

      const payload: AuthenticateGuestPayload = {
        displayName: cleanName,
        guestToken: tokenToSend,
        avatarId,
      };

      const sent = this.send(MessageType.AUTHENTICATE_GUEST, payload);
      if (!sent) {
        this.cleanupAuthPromise(new Error('Failed to send AUTHENTICATE_GUEST frame'));
        this.setState(ConnectionState.CONNECTED);
      }
    });
  }

  // ==========================================================================
  // Messaging & Envelope Transmission
  // ==========================================================================

  /**
   * Sends a typed message envelope to the backend.
   */
  public send<K extends MessageType>(type: K, payload: PayloadMap[K]): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.emitError('SEND_FAILED_SOCKET_NOT_OPEN', `Cannot send '${type}': socket is not OPEN`);
      return false;
    }

    const envelope: MessageEnvelope<PayloadMap[K]> = {
      protocolVersion: PROTOCOL_VERSION,
      type,
      timestamp: Date.now(),
      payload,
    };

    try {
      this.socket.send(JSON.stringify(envelope));
      return true;
    } catch (err) {
      this.emitError('SEND_EXCEPTION', `Failed to serialize or send '${type}'`, err);
      return false;
    }
  }

  // ==========================================================================
  // Inbound Socket Message Processing
  // ==========================================================================

  private handleSocketMessage(
    rawText: unknown,
    onWelcome?: (welcome: ConnectionAcceptedPayload) => void
  ): void {
    if (typeof rawText !== 'string') {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      this.emitError('MALFORMED_JSON', 'Received non-JSON frame from server', err);
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      this.emitError('INVALID_ENVELOPE', 'Frame is not a JSON object');
      return;
    }

    const envelope = parsed as MessageEnvelope<any>;

    if (!envelope.type || typeof envelope.type !== 'string') {
      this.emitError('MISSING_MESSAGE_TYPE', 'Message envelope is missing "type" field');
      return;
    }

    // Process system envelopes
    switch (envelope.type) {
      case MessageType.CONNECTION_ACCEPTED: {
        const welcome = envelope.payload as ConnectionAcceptedPayload;
        this.sessionId = welcome.sessionId;
        if (welcome.heartbeatIntervalMs && welcome.heartbeatIntervalMs > 0) {
          this.heartbeatIntervalMs = welcome.heartbeatIntervalMs;
        }
        this.setState(ConnectionState.CONNECTED);
        this.startHeartbeat();
        if (onWelcome) {
          onWelcome(welcome);
        }
        break;
      }

      case MessageType.AUTHENTICATION_RESULT: {
        const auth = envelope.payload as AuthenticationResultPayload;
        if (auth.success) {
          this.currentGuestToken = auth.guestToken;
          this.currentDisplayName = auth.displayName;
          // Persist to safe session store (token is NEVER logged)
          this.store.saveSession(auth.guestToken, auth.displayName);
          this.setState(ConnectionState.AUTHENTICATED);

          if (this.authPromiseResolve) {
            const resolve = this.authPromiseResolve;
            this.cleanupAuthPromise();
            resolve(auth);
          }
        } else {
          this.setState(ConnectionState.CONNECTED);
          if (this.authPromiseReject) {
            const reject = this.authPromiseReject;
            this.cleanupAuthPromise();
            reject(new Error('Authentication rejected by server'));
          }
        }
        break;
      }

      case MessageType.PONG: {
        const pong = envelope.payload as PongPayload;
        this.handlePong(pong);
        break;
      }

      case MessageType.ERROR: {
        const errPayload = envelope.payload as ErrorPayload;
        this.emitError(errPayload.errorCode || 'SERVER_ERROR', errPayload.message || 'Server reported an error');
        break;
      }
    }

    // Dispatch to registered type-specific listeners
    const listeners = this.messageListeners.get(envelope.type as MessageType);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        try {
          listener(envelope.payload, envelope);
        } catch (listenerErr) {
          this.emitError('LISTENER_EXCEPTION', `Listener for '${envelope.type}' threw an uncaught error`, listenerErr);
        }
      }
    }
  }

  private handleSocketClose(event: CloseEvent): void {
    this.stopHeartbeat();
    this.cleanupAuthPromise(new Error(`Socket closed (code: ${event.code})`));
    this.sessionId = null;
    this.socket = null;
    this.setState(ConnectionState.DISCONNECTED);
  }

  // ==========================================================================
  // Heartbeat & RTT Latency Measurement
  // ==========================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.sendPing();

    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendPing(): void {
    if (this.state !== ConnectionState.CONNECTED && this.state !== ConnectionState.AUTHENTICATED) {
      return;
    }

    this.lastPingSentAt = Date.now();
    const payload: PingPayload = {
      clientTimestamp: this.lastPingSentAt,
    };
    this.send(MessageType.PING, payload);
  }

  private handlePong(pong: PongPayload): void {
    const now = Date.now();
    const roundTripTime = Math.max(0, now - (pong.clientTimestamp || this.lastPingSentAt));
    this.currentRttMs = roundTripTime;

    // Exponential moving average (weight 0.25 to new sample)
    if (this.smoothedRttMs === 0) {
      this.smoothedRttMs = roundTripTime;
    } else {
      this.smoothedRttMs = Math.round(this.smoothedRttMs * 0.75 + roundTripTime * 0.25);
    }

    for (const listener of this.latencyListeners) {
      try {
        listener(this.currentRttMs, this.smoothedRttMs);
      } catch (err) {
        this.emitError('LISTENER_EXCEPTION', 'Latency listener threw error', err);
      }
    }
  }

  // ==========================================================================
  // Strongly-Typed Event Subscription System
  // ==========================================================================

  /**
   * Subscribes to messages of a specific type.
   * Returns an unsubscribe function for convenient scene cleanup.
   * Duplicate subscriptions with the exact same handler are ignored.
   */
  public on<K extends MessageType>(
    type: K,
    handler: (payload: PayloadMap[K], envelope: MessageEnvelope<PayloadMap[K]>) => void
  ): () => void {
    let set = this.messageListeners.get(type);
    if (!set) {
      set = new Set();
      this.messageListeners.set(type, set);
    }
    set.add(handler as MessageHandler);

    return () => this.off(type, handler);
  }

  /**
   * Unsubscribes a previously registered handler.
   */
  public off<K extends MessageType>(
    type: K,
    handler: (payload: PayloadMap[K], envelope: MessageEnvelope<PayloadMap[K]>) => void
  ): void {
    const set = this.messageListeners.get(type);
    if (set) {
      set.delete(handler as MessageHandler);
      if (set.size === 0) {
        this.messageListeners.delete(type);
      }
    }
  }

  /**
   * Subscribes to a single message of a specific type, then automatically unregisters.
   */
  public once<K extends MessageType>(
    type: K,
    handler: (payload: PayloadMap[K], envelope: MessageEnvelope<PayloadMap[K]>) => void
  ): () => void {
    const wrapper = (payload: PayloadMap[K], envelope: MessageEnvelope<PayloadMap[K]>) => {
      this.off(type, wrapper);
      handler(payload, envelope);
    };
    return this.on(type, wrapper);
  }

  /**
   * Subscribes to connection state changes (DISCONNECTED, CONNECTING, etc.).
   */
  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  /**
   * Subscribes to network errors.
   */
  public onError(handler: ErrorHandler): () => void {
    this.errorListeners.add(handler);
    return () => {
      this.errorListeners.delete(handler);
    };
  }

  /**
   * Subscribes to latency / RTT updates.
   */
  public onLatency(handler: LatencyHandler): () => void {
    this.latencyListeners.add(handler);
    return () => {
      this.latencyListeners.delete(handler);
    };
  }

  /**
   * Removes all listeners across all message types.
   * Critical for scene shutdown handlers to prevent memory leaks.
   */
  public removeAllListeners(): void {
    this.messageListeners.clear();
    this.stateListeners.clear();
    this.errorListeners.clear();
    this.latencyListeners.clear();
  }

  // ==========================================================================
  // Internal State & Error Helpers
  // ==========================================================================

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;

    for (const listener of this.stateListeners) {
      try {
        listener(newState, oldState);
      } catch (err) {
        this.emitError('LISTENER_EXCEPTION', 'StateChange listener threw error', err);
      }
    }
  }

  private emitError(code: string, message: string, originalError?: unknown): void {
    const err: NetworkError = { code, message, originalError };
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch {
        // Suppress nested error emission
      }
    }
  }

  private cleanupAuthPromise(errorToReject?: Error): void {
    if (this.authTimeoutTimer) {
      clearTimeout(this.authTimeoutTimer);
      this.authTimeoutTimer = null;
    }
    if (errorToReject && this.authPromiseReject) {
      this.authPromiseReject(errorToReject);
    }
    this.authPromiseResolve = null;
    this.authPromiseReject = null;
  }

  private getDefaultWebSocketUrl(): string {
    if (typeof (import.meta as any)?.env?.VITE_WS_URL === 'string' && (import.meta as any).env.VITE_WS_URL) {
      return (import.meta as any).env.VITE_WS_URL;
    }
    if (typeof window !== 'undefined' && (window as any).__NITRO_WS_URL__) {
      return (window as any).__NITRO_WS_URL__;
    }
    if (typeof window !== 'undefined' && window.location) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      return `${protocol}//${host}:8080/ws/game`;
    }
    return 'ws://localhost:8080/ws/game';
  }

  // ==========================================================================
  // Public Getters (Read-Only State Inspection)
  // ==========================================================================

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED || this.state === ConnectionState.AUTHENTICATED;
  }

  public isAuthenticated(): boolean {
    return this.state === ConnectionState.AUTHENTICATED;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getDisplayName(): string | null {
    return this.currentDisplayName;
  }

  public getGuestToken(): string | null {
    return this.currentGuestToken;
  }

  public getLatency(): { currentRttMs: number; smoothedRttMs: number } {
    return {
      currentRttMs: this.currentRttMs,
      smoothedRttMs: this.smoothedRttMs,
    };
  }

  public getWsUrl(): string {
    return this.wsUrl;
  }
}

export const networkManager = NetworkManager.getInstance();
