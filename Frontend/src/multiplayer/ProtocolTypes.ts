/**
 * Nitro Rush Multiplayer Protocol Specification (Protocol v1.0)
 *
 * Ground-truth TypeScript type definitions mirroring the Spring Boot backend
 * (com.nitrorush.backend.protocol).
 *
 * NOTE: Written to be 100% compliant with TypeScript 'erasableSyntaxOnly: true'
 * by using `as const` object dictionaries instead of TypeScript enums.
 */

export const PROTOCOL_VERSION = '1.0' as const;

// ============================================================================
// Message Types (Mirrors com.nitrorush.backend.protocol.MessageType)
// ============================================================================

export const MessageType = {
  // Client-to-Server Messages (Client Outbound)
  CONNECT: 'CONNECT',
  AUTHENTICATE_GUEST: 'AUTHENTICATE_GUEST',
  JOIN_MATCHMAKING: 'JOIN_MATCHMAKING',
  CANCEL_MATCHMAKING: 'CANCEL_MATCHMAKING',
  SELECT_CAR: 'SELECT_CAR',
  PLAYER_READY: 'PLAYER_READY',
  PLAYER_INPUT: 'PLAYER_INPUT',
  PING: 'PING',
  RECONNECT: 'RECONNECT',
  CREATE_PRIVATE_ROOM: 'CREATE_PRIVATE_ROOM',
  JOIN_PRIVATE_ROOM: 'JOIN_PRIVATE_ROOM',
  LEAVE_PRIVATE_ROOM: 'LEAVE_PRIVATE_ROOM',
  START_PRIVATE_RACE: 'START_PRIVATE_RACE',

  // Server-to-Client Messages (Server Outbound)
  CONNECTION_ACCEPTED: 'CONNECTION_ACCEPTED',
  AUTHENTICATION_RESULT: 'AUTHENTICATION_RESULT',
  MATCHMAKING_STATUS: 'MATCHMAKING_STATUS',
  ROOM_ASSIGNED: 'ROOM_ASSIGNED',
  PRIVATE_ROOM_CREATED: 'PRIVATE_ROOM_CREATED',
  PRIVATE_ROOM_JOINED: 'PRIVATE_ROOM_JOINED',
  PRIVATE_ROOM_UPDATED: 'PRIVATE_ROOM_UPDATED',
  PRIVATE_ROOM_ERROR: 'PRIVATE_ROOM_ERROR',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  PLAYER_READY_STATUS: 'PLAYER_READY_STATUS',
  COUNTDOWN_STARTED: 'COUNTDOWN_STARTED',
  RACE_STARTED: 'RACE_STARTED',
  RACE_STATE: 'RACE_STATE',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  RACE_FINISHED: 'RACE_FINISHED',
  RACE_RESULTS: 'RACE_RESULTS',
  ERROR: 'ERROR',
  PONG: 'PONG',
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

// ============================================================================
// Error Codes (Mirrors com.nitrorush.backend.protocol.ErrorCode)
// ============================================================================

export const ErrorCode = {
  INVALID_PROTOCOL_VERSION: 'INVALID_PROTOCOL_VERSION',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USERNAME_CONTAINS_PROFANITY: 'USERNAME_CONTAINS_PROFANITY',
  ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
  NOT_IN_QUEUE: 'NOT_IN_QUEUE',
  ALREADY_IN_RACE: 'ALREADY_IN_RACE',
  INVALID_CAR_ID: 'INVALID_CAR_ID',
  ROOM_NOT_IN_LOBBY: 'ROOM_NOT_IN_LOBBY',
  ROOM_STATE_INVALID: 'ROOM_STATE_INVALID',
  UNSUPPORTED_MESSAGE_TYPE: 'UNSUPPORTED_MESSAGE_TYPE',
  INVALID_INPUT_VALUES: 'INVALID_INPUT_VALUES',
  ROOM_ALREADY_CLOSED: 'ROOM_ALREADY_CLOSED',
  INVALID_RECONNECT_TOKEN: 'INVALID_RECONNECT_TOKEN',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  NOT_ROOM_HOST: 'NOT_ROOM_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  PLAYERS_NOT_READY: 'PLAYERS_NOT_READY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

// ============================================================================
// Client Connection States
// ============================================================================

export const ConnectionState = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  AUTHENTICATING: 'AUTHENTICATING',
  AUTHENTICATED: 'AUTHENTICATED',
  CLOSING: 'CLOSING',
  RECONNECTING: 'RECONNECTING',
} as const;

export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

// ============================================================================
// Standard Protocol Envelope (com.nitrorush.backend.protocol.MessageEnvelope)
// ============================================================================

export interface MessageEnvelope<T = unknown> {
  protocolVersion: string;
  type: MessageType;
  timestamp: number;
  payload: T;
}

// ============================================================================
// Protocol Payloads (com.nitrorush.backend.protocol.payload.*)
// ============================================================================

/**
 * Handshake payload sent by client upon establishing connection (optional in Protocol v1.0).
 */
export interface ConnectPayload {
  clientVersion: string;
  platform?: string;
}

/**
 * Sent by server immediately upon connection establishment.
 */
export interface ConnectionAcceptedPayload {
  sessionId: string;
  heartbeatIntervalMs: number;
}

/**
 * Sent by client to authenticate as a guest player.
 */
export interface AuthenticateGuestPayload {
  displayName: string;
  guestToken?: string;
  avatarId?: string;
}

/**
 * Sent by server in response to AUTHENTICATE_GUEST.
 */
export interface AuthenticationResultPayload {
  success: boolean;
  guestToken: string;
  displayName: string;
}

/**
 * Sent by client to measure latency (every 10s).
 */
export interface PingPayload {
  clientTimestamp: number;
}

/**
 * Sent by server in response to PING.
 */
export interface PongPayload {
  clientTimestamp: number;
  serverTimestamp: number;
}

/**
 * Sent by server on any protocol, validation, or processing error.
 */
export interface ErrorPayload {
  errorCode: string;
  message: string;
}

/**
 * Sent by server to notify queued clients of matchmaking queue status.
 */
export interface MatchmakingStatusPayload {
  status: 'QUEUED' | 'COLLECTION_WINDOW' | 'MATCHED' | 'CANCELLED';
  position: number;
  totalWaiting: number;
  collectionTimeRemainingSec?: number;
  minPlayers?: number;
  maxPlayers?: number;
}

/**
 * Sent by client to join a multiplayer race room.
 */
export interface JoinMatchmakingPayload {
  preferredTrackId: string;
  preferredCarId: string;
  guestToken?: string;
  roomId?: string;
}

/**
 * Sent by client to leave matchmaking or exit a waiting room.
 */
export interface CancelMatchmakingPayload {
  guestToken?: string;
  roomId?: string;
}

/**
 * Player slot information inside a room.
 */
export interface PlayerSlotInfo {
  id: string;
  name: string;
  carId: string;
  slot: string;
  isReady: boolean;
}

/**
 * Sent by server to assign a player to an 8-player room.
 */
export interface RoomAssignedPayload {
  roomId: string;
  trackId: string;
  slotId: string;
  maxLaps: number;
  players: PlayerSlotInfo[];
}

/**
 * Broadcast by server when another player joins the room.
 */
export interface PlayerJoinedPayload {
  player: PlayerSlotInfo;
}

/**
 * Broadcast by server when a player leaves the room.
 */
export interface PlayerLeftPayload {
  playerId: string;
  slot: string;
}

/**
 * Sent by client to change selected car in the room lobby.
 */
export interface SelectCarPayload {
  carId: string;
  roomId?: string;
}

/**
 * Sent by client to toggle ready status in the room lobby.
 */
export interface PlayerReadyPayload {
  isReady: boolean;
  roomId?: string;
}

/**
 * Broadcast by server when a player's ready status or car changes.
 */
export interface PlayerReadyStatusPayload {
  playerId: string;
  isReady: boolean;
  carId: string;
}

/**
 * Broadcast by server when the 3-second pre-race countdown begins.
 */
export interface CountdownStartedPayload {
  durationSeconds: number;
}

/**
 * Broadcast by server when the countdown completes and the race starts.
 */
export interface RaceStartedPayload {
  serverTimestamp: number;
}

/**
 * Sent by client at 20 Hz with current driver inputs during race.
 */
export interface PlayerInputPayload {
  roomId: string;
  sequenceNumber: number;
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
  nitro: boolean;
}

/**
 * Telemetry snapshot for an individual vehicle in RACE_STATE.
 */
export interface VehicleTelemetry {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  speedKMH: number;
  lap: number;
  nextCp: number;
  nitro: number;
  isDrifting: boolean;
  pos: number;
  status: string;
}

/**
 * Broadcast by server at 20 Hz containing world snapshot.
 */
export interface RaceStatePayload {
  serverTick: number;
  serverTimeMs: number;
  ackInputSeq: Record<string, number>;
  vehicles: VehicleTelemetry[];
}

/**
 * Broadcast by server when an individual player crosses the finish line.
 */
export interface RaceFinishedPayload {
  playerId: string;
  finishPosition: number;
  totalTimeMs: number;
  bestLapMs: number;
  lapTimesMs: number[];
}

/**
 * Final competitor standing in RACE_RESULTS.
 */
export interface CompetitorResultItem {
  position: number;
  playerId: string;
  displayName: string;
  carId: string;
  totalTimeMs: number;
  bestLapMs: number;
  status: string;
}

/**
 * Broadcast by server when the race completes for all participants.
 */
export interface RaceResultsPayload {
  trackId: string;
  results: CompetitorResultItem[];
}

/**
 * Broadcast by server when a player unexpectedly disconnects during race.
 */
export interface PlayerDisconnectedPayload {
  playerId: string;
  graceTimeRemainingSec: number;
}

/**
 * Sent by client to re-attach to an active race session.
 */
export interface ReconnectPayload {
  roomId: string;
  guestToken: string;
  lastKnownServerTick: number;
}

/**
 * Broadcast by server when a disconnected player successfully reconnects.
 */
export interface PlayerReconnectedPayload {
  playerId: string;
}

/**
 * Sent by client to create a private multiplayer room.
 */
export interface CreatePrivateRoomPayload {
  preferredTrackId?: string;
  preferredCarId?: string;
}

/**
 * Sent by client to join a private multiplayer room by code.
 */
export interface JoinPrivateRoomPayload {
  roomCode: string;
  preferredCarId?: string;
}

/**
 * Sent by client to leave a private multiplayer room.
 */
export interface LeavePrivateRoomPayload {
  roomCode?: string;
  roomId?: string;
}

/**
 * Sent by room host to start private race once all are ready.
 */
export interface StartPrivateRacePayload {
  roomCode?: string;
  roomId?: string;
}

/**
 * Sent by server to creator when private room is successfully created.
 */
export interface PrivateRoomCreatedPayload {
  roomCode: string;
  roomId: string;
  trackId: string;
  slotId: string;
  hostPlayerId: string;
  maxPlayers: number;
  players: PlayerSlotInfo[];
}

/**
 * Sent by server to joiner when private room is successfully joined.
 */
export interface PrivateRoomJoinedPayload {
  roomCode: string;
  roomId: string;
  trackId: string;
  slotId: string;
  hostPlayerId: string;
  maxPlayers: number;
  players: PlayerSlotInfo[];
}

/**
 * Broadcast by server to all private room members on state/membership/ready changes.
 */
export interface PrivateRoomUpdatedPayload {
  roomCode: string;
  roomId: string;
  hostPlayerId: string;
  players: PlayerSlotInfo[];
  allReady: boolean;
  readyCount: number;
  totalPlayers: number;
}

/**
 * Sent by server on private room errors (invalid code, not host, etc.).
 */
export interface PrivateRoomErrorPayload {
  errorCode: string;
  message: string;
}

// ============================================================================
// Type-safe mapping between MessageType and Payload
// ============================================================================

export interface PayloadMap {
  [MessageType.CONNECT]: ConnectPayload;
  [MessageType.CONNECTION_ACCEPTED]: ConnectionAcceptedPayload;
  [MessageType.AUTHENTICATE_GUEST]: AuthenticateGuestPayload;
  [MessageType.AUTHENTICATION_RESULT]: AuthenticationResultPayload;
  [MessageType.MATCHMAKING_STATUS]: MatchmakingStatusPayload;
  [MessageType.JOIN_MATCHMAKING]: JoinMatchmakingPayload;
  [MessageType.CANCEL_MATCHMAKING]: CancelMatchmakingPayload;
  [MessageType.CREATE_PRIVATE_ROOM]: CreatePrivateRoomPayload;
  [MessageType.JOIN_PRIVATE_ROOM]: JoinPrivateRoomPayload;
  [MessageType.LEAVE_PRIVATE_ROOM]: LeavePrivateRoomPayload;
  [MessageType.START_PRIVATE_RACE]: StartPrivateRacePayload;
  [MessageType.PRIVATE_ROOM_CREATED]: PrivateRoomCreatedPayload;
  [MessageType.PRIVATE_ROOM_JOINED]: PrivateRoomJoinedPayload;
  [MessageType.PRIVATE_ROOM_UPDATED]: PrivateRoomUpdatedPayload;
  [MessageType.PRIVATE_ROOM_ERROR]: PrivateRoomErrorPayload;
  [MessageType.ROOM_ASSIGNED]: RoomAssignedPayload;
  [MessageType.PLAYER_JOINED]: PlayerJoinedPayload;
  [MessageType.PLAYER_LEFT]: PlayerLeftPayload;
  [MessageType.SELECT_CAR]: SelectCarPayload;
  [MessageType.PLAYER_READY]: PlayerReadyPayload;
  [MessageType.PLAYER_READY_STATUS]: PlayerReadyStatusPayload;
  [MessageType.COUNTDOWN_STARTED]: CountdownStartedPayload;
  [MessageType.RACE_STARTED]: RaceStartedPayload;
  [MessageType.PLAYER_INPUT]: PlayerInputPayload;
  [MessageType.RACE_STATE]: RaceStatePayload;
  [MessageType.PLAYER_DISCONNECTED]: PlayerDisconnectedPayload;
  [MessageType.PLAYER_RECONNECTED]: PlayerReconnectedPayload;
  [MessageType.RECONNECT]: ReconnectPayload;
  [MessageType.RACE_FINISHED]: RaceFinishedPayload;
  [MessageType.RACE_RESULTS]: RaceResultsPayload;
  [MessageType.PING]: PingPayload;
  [MessageType.PONG]: PongPayload;
  [MessageType.ERROR]: ErrorPayload;
}

