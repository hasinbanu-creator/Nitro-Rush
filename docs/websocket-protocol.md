# NITRO RUSH — WEBSOCKET PROTOCOL SPECIFICATION
## Version: 1.0 (Milestone 8.0.1 Revised)

---

## 1. Transport, Framing & Bandwidth Definitions

- **Local Development URI:** `ws://localhost:8080/ws/game`
- **Production Secure URI:** `wss://<production-host>/ws/game`
- **Wire Format:** Strict UTF-8 JSON text frames.
- **Protocol Version:** `v1.0` (all messages carry `"protocolVersion": "1.0"`).
- **Maximum Frame Size:** 4,096 bytes (4 KB). Frames exceeding this limit will immediately close the connection with WebSocket close code `1009` (*Message Too Big*).
- **Heartbeat:** Bidirectional `PING` / `PONG` exchange every 10 seconds. Connections are dropped after 30 seconds of inactivity.
- **Client Outbound (Uplink):** `PLAYER_INPUT` transmitted by client at 20 msgs/sec (capped at 30 msgs/sec maximum). Bursts exceeding 35 msgs/sec result in discarded frames and an `ERROR` code `RATE_LIMIT_EXCEEDED`.
- **Client Inbound (Downlink):** `RACE_STATE` authoritative snapshots transmitted by server at 20 Hz (every 50 ms).

---

## 2. Common Envelope Structure

Every message sent across the WebSocket follows a standardized envelope structure:

```json
{
  "protocolVersion": "1.0",
  "type": "MESSAGE_TYPE",
  "timestamp": 1730985600123,
  "payload": {}
}
```

---

## 3. Client-to-Server Messages (Uplink)

### 3.1 `CONNECT` [Client \(\to\) Server]
Sent immediately after the WebSocket handshake completes to initialize the protocol session.
- **Direction:** Client \(\to\) Server
- **Message Type:** `CONNECT`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `protocolVersion`, `clientVersion`
- **Optional Fields:** `platform`
- **Validation Rules:** `protocolVersion` must equal `"1.0"`. `clientVersion` must follow semver format.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "CONNECT",
  "timestamp": 1730985600000,
  "payload": {
    "clientVersion": "1.0.0",
    "platform": "web-browser"
  }
}
```
- **Error Response:** `ERROR` (`INVALID_PROTOCOL_VERSION` / `CLIENT_VERSION_OUTDATED`)

---

### 3.2 `AUTHENTICATE_GUEST` [Client \(\to\) Server]
Authenticates a guest user session.
- **Direction:** Client \(\to\) Server
- **Message Type:** `AUTHENTICATE_GUEST`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `guestToken`, `displayName`
- **Optional Fields:** `avatarId`
- **Validation Rules:** `guestToken` must be a valid UUID string (or empty for initial registration); `displayName` length between 2 and 16 alphanumeric characters.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "AUTHENTICATE_GUEST",
  "timestamp": 1730985600050,
  "payload": {
    "guestToken": "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145",
    "displayName": "SpeedDemon99"
  }
}
```
- **Error Response:** `ERROR` (`INVALID_CREDENTIALS` / `USERNAME_CONTAINS_PROFANITY`)

---

### 3.3 `JOIN_MATCHMAKING` [Client \(\to\) Server]
Requests entry into the public matchmaking pool.
- **Direction:** Client \(\to\) Server
- **Message Type:** `JOIN_MATCHMAKING`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `guestToken`, `preferredTrackId`
- **Optional Fields:** `preferredCarId`
- **Validation Rules:** `preferredTrackId` must match one of the 9 valid track IDs (`coastal-rush`, `city-nights`, `mountain-pass`, `desert-heat`, `forest-trail`, `snow-peaks`, `volcano-run`, `rural-village`, `space-station`).
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "JOIN_MATCHMAKING",
  "timestamp": 1730985601000,
  "payload": {
    "guestToken": "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145",
    "preferredTrackId": "coastal-rush",
    "preferredCarId": "bolt-gt"
  }
}
```
- **Error Response:** `ERROR` (`ALREADY_IN_QUEUE` / `ALREADY_IN_RACE`)

---

### 3.4 `CANCEL_MATCHMAKING` [Client \(\to\) Server]
Cancels queue search and returns to main menu.
- **Direction:** Client \(\to\) Server
- **Message Type:** `CANCEL_MATCHMAKING`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `guestToken`
- **Optional Fields:** None
- **Validation Rules:** Player must be in an active matchmaking queue.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "CANCEL_MATCHMAKING",
  "timestamp": 1730985605000,
  "payload": {
    "guestToken": "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145"
  }
}
```
- **Error Response:** `ERROR` (`NOT_IN_QUEUE`)

---

### 3.5 `SELECT_CAR` [Client \(\to\) Server]
Selects or changes the player's vehicle during pre-race lobby wait.
- **Direction:** Client \(\to\) Server
- **Message Type:** `SELECT_CAR`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `roomId`, `carId`
- **Optional Fields:** None
- **Validation Rules:** `carId` must be one of: `"bolt-gt"`, `"viper-r"`, `"rally-apex"`, `"titan-v8"`. Room state must be `WAITING`.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "SELECT_CAR",
  "timestamp": 1730985618000,
  "payload": {
    "roomId": "room-88294",
    "carId": "viper-r"
  }
}
```
- **Error Response:** `ERROR` (`INVALID_CAR_ID` / `ROOM_NOT_IN_LOBBY`)

---

### 3.6 `PLAYER_READY` [Client \(\to\) Server]
Toggles or confirms the player's readiness in the pre-race lobby.
- **Direction:** Client \(\to\) Server
- **Message Type:** `PLAYER_READY`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `roomId`, `isReady`
- **Optional Fields:** None
- **Validation Rules:** `isReady` must be boolean. Room must be in `WAITING` state.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_READY",
  "timestamp": 1730985620000,
  "payload": {
    "roomId": "room-88294",
    "isReady": true
  }
}
```
- **Error Response:** `ERROR` (`ROOM_STATE_INVALID`)

---

### 3.7 `PLAYER_INPUT` [Client \(\to\) Server]
High-frequency client input transmission during `RACING` state.
- **Direction:** Client \(\to\) Server
- **Message Type:** `PLAYER_INPUT`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `roomId`, `sequenceNumber`, `throttle`, `brake`, `steer`, `drift`, `nitro`
- **Optional Fields:** None
- **Validation Rules:**
  - `sequenceNumber`: Positive integer, strictly monotonic.
  - `throttle`: Float clamped \([0.0, 1.0]\).
  - `brake`: Float clamped \([0.0, 1.0]\).
  - `steer`: Float clamped \([-1.0, 1.0]\).
  - `drift`: Boolean.
  - `nitro`: Boolean.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_INPUT",
  "timestamp": 1730985635150,
  "payload": {
    "roomId": "room-88294",
    "sequenceNumber": 482,
    "throttle": 1.0,
    "brake": 0.0,
    "steer": -0.45,
    "drift": true,
    "nitro": false
  }
}
```
- **Error Response:** Discarded silently or `ERROR` (`RATE_LIMIT_EXCEEDED` / `INVALID_INPUT_VALUES`)

---

### 3.8 `PING` [Client \(\to\) Server]
Client-initiated heartbeat telemetry packet.
- **Direction:** Client \(\to\) Server
- **Message Type:** `PING`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `clientTimestamp`
- **Optional Fields:** None
- **Validation Rules:** Positive integer unix epoch millisecond timestamp.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PING",
  "timestamp": 1730985640000,
  "payload": {
    "clientTimestamp": 1730985640000
  }
}
```
- **Error Response:** None; server responds with `PONG`.

---

### 3.9 `RECONNECT` [Client \(\to\) Server]
Transmitted by a disconnected racer attempting to rejoin their active room.
- **Direction:** Client \(\to\) Server
- **Message Type:** `RECONNECT`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `roomId`, `guestToken`, `lastKnownServerTick`
- **Optional Fields:** None
- **Validation Rules:** Must be within the 15-second grace window; room must not be `CLOSED`.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "RECONNECT",
  "timestamp": 1730985650000,
  "payload": {
    "roomId": "room-88294",
    "guestToken": "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145",
    "lastKnownServerTick": 1240
  }
}
```
- **Error Response:** `ERROR` (`SESSION_EXPIRED` / `ROOM_ALREADY_CLOSED` / `INVALID_RECONNECT_TOKEN`)

---

## 4. Server-to-Client Messages (Downlink)

### 4.1 `CONNECTION_ACCEPTED` [Server \(\to\) Client]
Confirms successful WebSocket handshake and protocol agreement.
- **Direction:** Server \(\to\) Client
- **Message Type:** `CONNECTION_ACCEPTED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `sessionId`, `heartbeatIntervalMs`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "CONNECTION_ACCEPTED",
  "timestamp": 1730985600020,
  "payload": {
    "sessionId": "ws-sess-9941a",
    "heartbeatIntervalMs": 10000
  }
}
```

---

### 4.2 `AUTHENTICATION_RESULT` [Server \(\to\) Client]
Returns the validated guest session profile and token.
- **Direction:** Server \(\to\) Client
- **Message Type:** `AUTHENTICATION_RESULT`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `success`, `guestToken`, `displayName`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "AUTHENTICATION_RESULT",
  "timestamp": 1730985600080,
  "payload": {
    "success": true,
    "guestToken": "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145",
    "displayName": "SpeedDemon99"
  }
}
```

---

### 4.3 `MATCHMAKING_STATUS` [Server \(\to\) Client]
Updates queue progress, player count, and remaining search window.
- **Direction:** Server \(\to\) Client
- **Message Type:** `MATCHMAKING_STATUS`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `inQueue`, `queuedPlayers`, `maxPlayers`, `timeRemainingSec`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "MATCHMAKING_STATUS",
  "timestamp": 1730985602500,
  "payload": {
    "inQueue": true,
    "queuedPlayers": 4,
    "maxPlayers": 8,
    "timeRemainingSec": 11.5
  }
}
```

---

### 4.4 `ROOM_ASSIGNED` [Server \(\to\) Client]
Dispatched by server to clients when a room is successfully formed.
- **Direction:** Server \(\to\) Client (Authoritative room formation)
- **Message Type:** `ROOM_ASSIGNED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `roomId`, `trackId`, `slotId`, `maxLaps`, `players`
- **Validation Rules:** `slotId` must be between `"P1"` and `"P8"`. `players` array length \(\le 8\).
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "ROOM_ASSIGNED",
  "timestamp": 1730985616000,
  "payload": {
    "roomId": "room-88294",
    "trackId": "coastal-rush",
    "slotId": "P2",
    "maxLaps": 3,
    "players": [
      { "id": "p1", "name": "TurboMax", "carId": "bolt-gt", "slot": "P1", "isReady": true },
      { "id": "p2", "name": "SpeedDemon99", "carId": "viper-r", "slot": "P2", "isReady": false }
    ]
  }
}
```

---

### 4.5 `PLAYER_JOINED` [Server \(\to\) Client]
Broadcast to room when an additional player enters the lobby.
- **Direction:** Server \(\to\) Client
- **Message Type:** `PLAYER_JOINED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `player`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_JOINED",
  "timestamp": 1730985617200,
  "payload": {
    "player": {
      "id": "p3",
      "name": "ApexDrifter",
      "carId": "rally-apex",
      "slot": "P3",
      "isReady": false
    }
  }
}
```

---

### 4.6 `PLAYER_LEFT` [Server \(\to\) Client]
Broadcast to room when a player leaves the lobby before race start.
- **Direction:** Server \(\to\) Client
- **Message Type:** `PLAYER_LEFT`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `playerId`, `slot`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_LEFT",
  "timestamp": 1730985619000,
  "payload": {
    "playerId": "p3",
    "slot": "P3"
  }
}
```

---

### 4.7 `PLAYER_READY_STATUS` [Server \(\to\) Client]
Broadcast when any racer toggles their ready status or car selection in lobby.
- **Direction:** Server \(\to\) Client
- **Message Type:** `PLAYER_READY_STATUS`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `playerId`, `isReady`, `carId`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_READY_STATUS",
  "timestamp": 1730985620100,
  "payload": {
    "playerId": "p2",
    "isReady": true,
    "carId": "viper-r"
  }
}
```

---

### 4.8 `COUNTDOWN_STARTED` [Server \(\to\) Client]
Signals transition from `WAITING` to `COUNTDOWN`.
- **Direction:** Server \(\to\) Client
- **Message Type:** `COUNTDOWN_STARTED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `durationSeconds` (always 3)
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "COUNTDOWN_STARTED",
  "timestamp": 1730985630000,
  "payload": {
    "durationSeconds": 3
  }
}
```

---

### 4.9 `RACE_STARTED` [Server \(\to\) Client]
Signals that countdown reached zero; controls are unlocked.
- **Direction:** Server \(\to\) Client
- **Message Type:** `RACE_STARTED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `serverTimestamp`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "RACE_STARTED",
  "timestamp": 1730985633000,
  "payload": {
    "serverTimestamp": 1730985633000
  }
}
```

---

### 4.10 `RACE_STATE` (Snapshot Broadcast — 20 Hz) [Server \(\to\) Client]
The core authoritative world state payload broadcast every 50 ms.
- **Direction:** Server \(\to\) Client
- **Message Type:** `RACE_STATE`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `serverTick`, `serverTimeMs`, `ackInputSeq`, `vehicles`
- **Per-Vehicle Fields:**
  - `id`: Player ID
  - `x`, `y`: World coordinates (float, 2 decimals)
  - `vx`, `vy`: Velocity vector (float, 2 decimals)
  - `rot`: Heading angle in radians (float, 3 decimals)
  - `speedKMH`: Integer speed
  - `lap`: Integer current lap (1, 2, 3)
  - `nextCp`: Next required checkpoint index (0–11)
  - `nitro`: Integer nitro amount (0–100)
  - `isDrifting`: Boolean
  - `pos`: Current live race rank (1–8)
  - `status`: `"RACING"` | `"FINISHED"` | `"DISCONNECTED"`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "RACE_STATE",
  "timestamp": 1730985635200,
  "payload": {
    "serverTick": 542,
    "serverTimeMs": 27100,
    "ackInputSeq": {
      "p1": 481,
      "p2": 482
    },
    "vehicles": [
      {
        "id": "p2",
        "x": 1284.52,
        "y": 1920.10,
        "vx": 642.15,
        "vy": -12.40,
        "rot": -0.019,
        "speedKMH": 257,
        "lap": 1,
        "nextCp": 2,
        "nitro": 92,
        "isDrifting": false,
        "pos": 1,
        "status": "RACING"
      },
      {
        "id": "p1",
        "x": 1210.30,
        "y": 1918.40,
        "vx": 620.00,
        "vy": -5.10,
        "rot": -0.008,
        "speedKMH": 248,
        "lap": 1,
        "nextCp": 2,
        "nitro": 84,
        "isDrifting": false,
        "pos": 2,
        "status": "RACING"
      }
    ]
  }
}
```

---

### 4.11 `PLAYER_DISCONNECTED` [Server \(\to\) Client]
Broadcast to room when a player loses connection during the race.
- **Direction:** Server \(\to\) Client
- **Message Type:** `PLAYER_DISCONNECTED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `playerId`, `graceTimeRemainingSec`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_DISCONNECTED",
  "timestamp": 1730985645000,
  "payload": {
    "playerId": "p1",
    "graceTimeRemainingSec": 15
  }
}
```

---

### 4.12 `PLAYER_RECONNECTED` [Server \(\to\) Client]
Broadcast to room when a disconnected player successfully rejoins within 15 seconds.
- **Direction:** Server \(\to\) Client
- **Message Type:** `PLAYER_RECONNECTED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `playerId`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PLAYER_RECONNECTED",
  "timestamp": 1730985652000,
  "payload": {
    "playerId": "p1"
  }
}
```

---

### 4.13 `RACE_FINISHED` [Server \(\to\) Client]
Sent individually to each racer as they cross the finish line on Lap 3.
- **Direction:** Server \(\to\) Client
- **Message Type:** `RACE_FINISHED`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `playerId`, `finishPosition`, `totalTimeMs`, `bestLapMs`, `lapTimesMs`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "RACE_FINISHED",
  "timestamp": 1730985720000,
  "payload": {
    "playerId": "p2",
    "finishPosition": 1,
    "totalTimeMs": 86450,
    "bestLapMs": 28140,
    "lapTimesMs": [29150, 28140, 29160]
  }
}
```

---

### 4.14 `RACE_RESULTS` [Server \(\to\) Client]
Sent to all participants when the race completely ends (all finished or 30s timer expired).
- **Direction:** Server \(\to\) Client
- **Message Type:** `RACE_RESULTS`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `results` array sorted 1st to 8th.
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "RACE_RESULTS",
  "timestamp": 1730985750000,
  "payload": {
    "trackId": "coastal-rush",
    "results": [
      {
        "position": 1,
        "playerId": "p2",
        "displayName": "SpeedDemon99",
        "carId": "viper-r",
        "totalTimeMs": 86450,
        "bestLapMs": 28140,
        "status": "FINISHED"
      },
      {
        "position": 2,
        "playerId": "p1",
        "displayName": "TurboMax",
        "carId": "bolt-gt",
        "totalTimeMs": 88120,
        "bestLapMs": 28910,
        "status": "FINISHED"
      }
    ]
  }
}
```

---

### 4.15 `ERROR` [Server \(\to\) Client]
Standard error packet dispatched when an invalid action occurs.
- **Direction:** Server \(\to\) Client
- **Message Type:** `ERROR`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `errorCode`, `message`
- **Standard Error Codes:**
  - `INVALID_PROTOCOL_VERSION`
  - `INVALID_PAYLOAD`
  - `RATE_LIMIT_EXCEEDED`
  - `ROOM_FULL`
  - `ROOM_NOT_FOUND`
  - `SESSION_EXPIRED`
  - `INVALID_CREDENTIALS`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "ERROR",
  "timestamp": 1730985601500,
  "payload": {
    "errorCode": "ROOM_FULL",
    "message": "Assigned room has already reached maximum capacity of 8 players."
  }
}
```

---

### 4.16 `PONG` [Server \(\to\) Client]
Heartbeat reply returning the client's original timestamp.
- **Direction:** Server \(\to\) Client
- **Message Type:** `PONG`
- **Protocol Version:** `"1.0"`
- **Required Fields:** `clientTimestamp`, `serverTimestamp`
- **Example Payload:**
```json
{
  "protocolVersion": "1.0",
  "type": "PONG",
  "timestamp": 1730985640025,
  "payload": {
    "clientTimestamp": 1730985640000,
    "serverTimestamp": 1730985640025
  }
}
```
