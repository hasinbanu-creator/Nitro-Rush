# Nitro Rush — Backend

Real-time, server-authoritative multiplayer backend for **Nitro Rush**, a 2D top-down arcade racing game.

---

## 1. Prerequisites & Environment

- **Java Development Kit (JDK):** Java 21 LTS (Oracle JDK or OpenJDK 21+)
- **Build Tool:** Apache Maven 3.9+
- **Architecture Compatibility:** macOS (Apple Silicon / Intel), Linux, Windows

Confirm local environment:
```bash
java -version   # Must output java version "21.x.x"
mvn -version    # Must output Apache Maven 3.9+
```

---

## 2. Technology Stack

- **Framework:** Spring Boot 3.3.5
- **Networking:** Raw Spring WebSocket (`WebSocketHandler`, without STOMP overhead)
- **Serialization:** Jackson JSON with JavaTime (`jsr310`) support
- **Validation:** Jakarta Bean Validation (`hibernate-validator`)
- **Testing:** JUnit 5 (Jupiter), AssertJ, Mockito, Spring Boot Test, StandardWebSocketClient

---

## 3. Package & Project Structure

```
Backend/
├── pom.xml
├── README.md
└── src/
    ├── main/
    │   ├── java/com/nitrorush/backend/
    │   │   ├── NitroRushApplication.java          # Spring Boot main entry point
    │   │   ├── config/
    │   │   │   ├── NitroRushProperties.java       # Type-safe configuration properties
    │   │   │   └── WebSocketConfig.java           # Endpoint registration & Origin CORS filter
    │   │   ├── websocket/
    │   │   │   ├── GameWebSocketHandler.java      # Framing, JSON envelope & message routing
    │   │   │   ├── ConnectionManager.java         # Thread-safe WebSocket session registry
    │   │   │   └── WebSocketHandshakeInterceptor.java # Origin security & metadata attachment
    │   │   ├── session/
    │   │   │   ├── GuestSession.java              # In-memory guest identity model
    │   │   │   ├── GuestSessionManager.java       # SecureRandom token generator & session manager
    │   │   │   └── PlayerConnection.java          # Physical WebSocket connection state
    │   │   ├── security/
    │   │   │   └── OriginValidator.java           # Cross-Site WebSocket Hijacking (CSWSH) protection
    │   │   ├── protocol/
    │   │   │   ├── MessageType.java               # Documented protocol v1.0 message inventory
    │   │   │   ├── MessageEnvelope.java           # Generic JSON message envelope
    │   │   │   ├── ErrorCode.java                 # Standard protocol error codes
    │   │   │   └── payload/                       # Typed Jackson DTO payloads
    │   │   │       ├── ConnectPayload.java
    │   │   │       ├── ConnectionAcceptedPayload.java
    │   │   │       ├── AuthenticateGuestPayload.java
    │   │   │       ├── AuthenticationResultPayload.java
    │   │   │       ├── PingPayload.java
    │   │   │       ├── PongPayload.java
    │   │   │       └── ErrorPayload.java
    │   │   └── exception/
    │   │       ├── ProtocolException.java
    │   │       └── SessionException.java
    │   └── resources/
    │       └── application.yml                    # Default application configuration
    └── test/
        ├── java/com/nitrorush/backend/
        │   ├── NitroRushApplicationTests.java     # Context load & bean verification
        │   ├── session/
        │   │   └── GuestSessionManagerTest.java   # Token entropy, uniqueness & sanitization tests
        │   ├── websocket/
        │   │   ├── ConnectionManagerTest.java     # Concurrent registration & lifecycle tests
        │   │   ├── GameWebSocketHandlerTest.java  # Fast unit tests for all framing, protocol & error paths
        │   │   ├── WebSocketHandshakeTest.java    # Origin filtering & security unit tests
        │   │   └── WebSocketIntegrationTest.java  # Live end-to-end WebSocket integration tests
        │   └── protocol/
        │       └── ProtocolSerializationTest.java # Jackson schema & envelope tests
        └── resources/
            └── application-test.yml               # Test-specific profile configuration
```

---

## 4. How to Build & Run

### 4.1 Running the Backend Locally
From the `Backend/` directory:
```bash
mvn spring-boot:run
```
The server will start on port `8080` (or the configured `server.port`).

### 4.2 Running the Test Suite
```bash
# Run 31 unit tests (fast, sandboxed, no live socket needed)
mvn clean test

# Run all 37 tests including live WebSocket integration tests
mvn test -Dtest=*Test
```

### 4.3 Building the Production JAR
```bash
mvn clean package
```
Generates executable JAR: `target/backend-0.0.1-SNAPSHOT.jar`. Run with:
```bash
java -jar target/backend-0.0.1-SNAPSHOT.jar
```

---

## 5. WebSocket Endpoint & Protocol

- **Endpoint:** `ws://localhost:8080/ws/game` (Development) / `wss://<host>/ws/game` (Production)
- **Protocol Version:** `1.0`
- **Max Frame Size:** `4,096 bytes` (4 KB)
- **Heartbeat Interval:** `10,000 ms` (10 seconds)

### Handshake & Security
Requests must provide an approved `Origin` header matching configured origins (default: `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`). Unapproved or missing origins are rejected with HTTP 403 Forbidden.

### Initial Connection Flow
1. Client connects via WebSocket handshake.
2. Server immediately sends `CONNECTION_ACCEPTED`:
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
3. Client sends `AUTHENTICATE_GUEST`:
   ```json
   {
     "protocolVersion": "1.0",
     "type": "AUTHENTICATE_GUEST",
     "timestamp": 1730985600050,
     "payload": {
       "displayName": "SpeedDemon99"
     }
   }
   ```
4. Server responds with `AUTHENTICATION_RESULT` containing the cryptographically secure guest token.
5. Bidirectional Heartbeat: Client sends `PING` with `clientTimestamp`, server replies with `PONG`.

---

## 6. Implemented Functionality (Milestone 8.1)

- [x] Java 21 / Spring Boot 3 Maven application foundation.
- [x] Raw Spring WebSocket handler at `/ws/game` using `TextWebSocketHandler`.
- [x] Strict Origin validation preventing Cross-Site WebSocket Hijacking.
- [x] Thread-safe `ConnectionManager` with concurrent session tracking and safe non-blocking text writes.
- [x] `GuestSessionManager` generating cryptographically secure UUID tokens using `SecureRandom`.
- [x] Full token masking (`maskToken`) ensuring tokens are never logged.
- [x] Documented JSON protocol envelope serialization and validation.
- [x] Application-level `PING` / `PONG` heartbeat mechanism.
- [x] Comprehensive automated JUnit 5 test suite with live WebSocket integration tests.

---

## 7. Intentionally Postponed Features

In accordance with the Nitro Rush architecture roadmap:
- **Milestone 8.2:** Headless Java physics engine, shared JSON geometry/car configs, and physics conformance suite.
- **Milestone 8.3:** Public matchmaking queue (15s window) and room state machine (`WAITING`, `COUNTDOWN`, `RACING`, `FINISHED`, `CLOSED`).
- **Milestone 8.4:** Frontend `NetworkClient.ts`, matchmaking UI, and multiplayer lobby scenes.
- **Milestone 8.5:** Client-side prediction, input ring buffering, server reconciliation, and 100 ms snapshot interpolation.
- **Milestone 8.6:** 8-player starting grid, server-authoritative checkpoint validation, and live leaderboard.
- **Milestone 8.7:** 15-second disconnection grace period and state resynchronization.
- **Milestone 8.8:** Automated multi-client load testing and final acceptance verification.
- **Future Infrastructure:** External Redis caching, MongoDB persistence, Docker containerization, Kubernetes orchestration, and AWS deployment.
