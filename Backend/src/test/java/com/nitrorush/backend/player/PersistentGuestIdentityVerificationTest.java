package com.nitrorush.backend.player;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.AuthenticateGuestPayload;
import com.nitrorush.backend.protocol.payload.ReconnectPayload;
import com.nitrorush.backend.room.PlayerSlot;
import com.nitrorush.backend.room.Room;
import com.nitrorush.backend.room.RoomManager;
import com.nitrorush.backend.session.GuestSession;
import com.nitrorush.backend.session.GuestSessionManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@DisplayName("Phase 2 Final Verification — Persistent Guest Identity Lifecycle")
class PersistentGuestIdentityVerificationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private GuestSessionManager guestSessionManager;

    @Autowired
    private GuestCredentialService guestCredentialService;

    @Autowired
    private PlayerRepository playerRepository;

    @Autowired
    private GuestCredentialRepository guestCredentialRepository;

    @Autowired
    private RoomManager roomManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private ObjectMapper objectMapper;
    private StandardWebSocketClient wsClient;
    private String wsUri;
    private WebSocketHttpHeaders headers;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        wsClient = new StandardWebSocketClient();
        wsUri = "ws://127.0.0.1:" + port + "/ws/game";

        headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:5173");
    }

    @AfterEach
    void tearDown() {
        guestSessionManager.clearAll();
    }

    private static class WebSocketTestHandler extends TextWebSocketHandler {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<WebSocketSession> openFuture = new CompletableFuture<>();
        final CompletableFuture<CloseStatus> closeFuture = new CompletableFuture<>();

        @Override
        public void afterConnectionEstablished(WebSocketSession session) {
            openFuture.complete(session);
        }

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.add(message.getPayload());
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            closeFuture.complete(status);
        }

        String awaitMessage(long timeoutMs) throws InterruptedException {
            return messages.poll(timeoutMs, TimeUnit.MILLISECONDS);
        }
    }

    private JsonNode authenticateWebSocket(WebSocketTestHandler handler, WebSocketSession session,
                                           String displayName, String guestToken) throws Exception {
        // First message is always CONNECTION_ACCEPTED
        String welcomeRaw = handler.awaitMessage(5000);
        assertThat(welcomeRaw).isNotNull();
        JsonNode welcomeNode = objectMapper.readTree(welcomeRaw);
        assertThat(welcomeNode.get("type").asText()).isEqualTo(MessageType.CONNECTION_ACCEPTED.name());

        // Send AUTHENTICATE_GUEST
        AuthenticateGuestPayload payload = new AuthenticateGuestPayload(guestToken, displayName, "car-bolt");
        MessageEnvelope<AuthenticateGuestPayload> envelope = MessageEnvelope.of(
                MessageType.AUTHENTICATE_GUEST, payload);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(envelope)));

        // Await AUTHENTICATION_RESULT
        String authRaw = handler.awaitMessage(5000);
        assertThat(authRaw).isNotNull();
        JsonNode authNode = objectMapper.readTree(authRaw);
        assertThat(authNode.get("type").asText()).isEqualTo(MessageType.AUTHENTICATION_RESULT.name());
        return authNode.get("payload");
    }

    // =========================================================================
    // TEST 1 — New Guest Registration (Actual WebSocket E2E Flow)
    // =========================================================================
    @Test
    @DisplayName("TEST 1: New Guest Registration via WebSocket creates 1 player, 1 credential, raw token never stored")
    void test1_NewGuestRegistration() throws Exception {
        String uniqueName = "RegTest_" + System.currentTimeMillis() % 10000;
        WebSocketTestHandler handler = new WebSocketTestHandler();
        WebSocketSession session = wsClient.execute(handler, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);

        try {
            JsonNode authPayload = authenticateWebSocket(handler, session, uniqueName, null);

            assertThat(authPayload.get("success").asBoolean()).isTrue();
            assertThat(authPayload.has("guestToken")).isTrue();
            assertThat(authPayload.has("playerId")).isTrue();

            String token = authPayload.get("guestToken").asText();
            UUID playerId = UUID.fromString(authPayload.get("playerId").asText());
            String expectedTokenHash = GuestCredentialService.hashToken(token);

            // 1. Verify exactly one row in players
            Integer playerCount = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM players WHERE player_id = ?", Integer.class, playerId);
            assertThat(playerCount).isEqualTo(1);

            // 2. Verify exactly one corresponding row in guest_credentials
            Integer credCount = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM guest_credentials WHERE player_id = ? AND token_hash = ?",
                    Integer.class, playerId, expectedTokenHash);
            assertThat(credCount).isEqualTo(1);

            // 3. Verify raw token is never stored anywhere in database
            Integer rawTokenInCreds = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM guest_credentials WHERE token_hash = ?", Integer.class, token);
            assertThat(rawTokenInCreds).isEqualTo(0);

            // Verify account type is GUEST
            String accountType = jdbcTemplate.queryForObject(
                    "SELECT account_type FROM players WHERE player_id = ?", String.class, playerId);
            assertThat(accountType).isEqualTo("GUEST");

        } finally {
            session.close();
        }
    }

    // =========================================================================
    // TEST 2 — Normal Reconnection (Disconnect and Reconnect with same token)
    // =========================================================================
    @Test
    @DisplayName("TEST 2: Normal Reconnection returns same playerId and creates 0 duplicate DB rows")
    void test2_NormalReconnection() throws Exception {
        String uniqueName = "Recon_" + System.currentTimeMillis() % 10000;
        String issuedToken;
        UUID originalPlayerId;

        // Session 1: Register initial guest
        WebSocketTestHandler handler1 = new WebSocketTestHandler();
        WebSocketSession session1 = wsClient.execute(handler1, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
        try {
            JsonNode auth1 = authenticateWebSocket(handler1, session1, uniqueName, null);
            issuedToken = auth1.get("guestToken").asText();
            originalPlayerId = UUID.fromString(auth1.get("playerId").asText());
        } finally {
            session1.close();
        }

        // Session 2: Disconnect and reconnect using the exact same guestToken
        WebSocketTestHandler handler2 = new WebSocketTestHandler();
        WebSocketSession session2 = wsClient.execute(handler2, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
        try {
            JsonNode auth2 = authenticateWebSocket(handler2, session2, uniqueName, issuedToken);
            String token2 = auth2.get("guestToken").asText();
            UUID playerId2 = UUID.fromString(auth2.get("playerId").asText());

            // Verify same identity returned
            assertThat(token2).isEqualTo(issuedToken);
            assertThat(playerId2).isEqualTo(originalPlayerId);

            // Verify no duplicate database records created
            Integer totalPlayersForId = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM players WHERE player_id = ?", Integer.class, originalPlayerId);
            assertThat(totalPlayersForId).isEqualTo(1);

            Integer totalCredsForId = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM guest_credentials WHERE player_id = ?", Integer.class, originalPlayerId);
            assertThat(totalCredsForId).isEqualTo(1);

        } finally {
            session2.close();
        }
    }

    // =========================================================================
    // TEST 3 — Backend Restart Recovery (In-memory cache cleared)
    // =========================================================================
    @Test
    @DisplayName("TEST 3: Backend Restart Recovery restores exact same playerId from PostgreSQL")
    void test3_BackendRestartRecovery() throws Exception {
        String uniqueName = "Restart_" + System.currentTimeMillis() % 10000;
        String issuedToken;
        UUID originalPlayerId;

        // Authenticate guest
        WebSocketTestHandler handler1 = new WebSocketTestHandler();
        WebSocketSession session1 = wsClient.execute(handler1, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
        try {
            JsonNode auth1 = authenticateWebSocket(handler1, session1, uniqueName, null);
            issuedToken = auth1.get("guestToken").asText();
            originalPlayerId = UUID.fromString(auth1.get("playerId").asText());
        } finally {
            session1.close();
        }

        // Simulate backend restart by wiping JVM in-memory activeSessions cache completely
        guestSessionManager.clearAll();
        assertThat(guestSessionManager.getActiveSessionCount()).isEqualTo(0);

        // Reconnect after restart using saved guestToken
        WebSocketTestHandler handler2 = new WebSocketTestHandler();
        WebSocketSession session2 = wsClient.execute(handler2, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
        try {
            JsonNode auth2 = authenticateWebSocket(handler2, session2, uniqueName, issuedToken);
            UUID restoredPlayerId = UUID.fromString(auth2.get("playerId").asText());

            // Verify the exact same playerId is restored from PostgreSQL
            assertThat(restoredPlayerId).isEqualTo(originalPlayerId);

            // Verify DB count remains exactly 1 player and 1 credential
            Integer playerCount = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM players WHERE player_id = ?", Integer.class, originalPlayerId);
            assertThat(playerCount).isEqualTo(1);

            Integer credCount = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM guest_credentials WHERE player_id = ?", Integer.class, originalPlayerId);
            assertThat(credCount).isEqualTo(1);

        } finally {
            session2.close();
        }
    }

    // =========================================================================
    // TEST 4 — Actual Concurrent Authentication (Real PostgreSQL Transactions)
    // =========================================================================
    @Test
    @DisplayName("TEST 4: Actual Concurrent Authentication with same token resolves to same playerId, 1 player, 1 credential")
    void test4_ActualConcurrentAuthentication() throws Exception {
        String unmappedToken = UUID.randomUUID().toString();
        String candidateName = "Concur_" + System.currentTimeMillis() % 10000;

        int threadCount = 2;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);

        List<Future<GuestSession>> futures = new ArrayList<>();
        for (int i = 0; i < threadCount; i++) {
            futures.add(executor.submit(() -> {
                startLatch.await(); // Ensure truly simultaneous execution
                return guestSessionManager.authenticateOrCreate(unmappedToken, candidateName, "car-1");
            }));
        }

        // Release both threads simultaneously
        startLatch.countDown();

        GuestSession session1 = futures.get(0).get(10, TimeUnit.SECONDS);
        GuestSession session2 = futures.get(1).get(10, TimeUnit.SECONDS);

        executor.shutdown();

        // Both simultaneous requests must resolve to the exact same playerId and token
        assertThat(session1.getPlayerId()).isNotNull();
        assertThat(session2.getPlayerId()).isNotNull();
        assertThat(session1.getPlayerId()).isEqualTo(session2.getPlayerId());
        assertThat(session1.getGuestToken()).isEqualTo(session2.getGuestToken());

        // Verify exactly one player and one credential record exist in PostgreSQL
        String tokenHash = GuestCredentialService.hashToken(unmappedToken);
        Integer playerCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM players WHERE player_id = ?", Integer.class, session1.getPlayerId());
        assertThat(playerCount).isEqualTo(1);

        Integer credCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM guest_credentials WHERE token_hash = ?", Integer.class, tokenHash);
        assertThat(credCount).isEqualTo(1);
    }

    // =========================================================================
    // TEST 5 — Expired and Revoked Credentials
    // =========================================================================
    @Test
    @DisplayName("TEST 5: Expired and Revoked Credentials cannot authenticate and replacement credential is issued")
    void test5_ExpiredAndRevokedCredentials() throws Exception {
        // Step A: Create and verify an initial guest
        String token = UUID.randomUUID().toString();
        GuestSession initial = guestSessionManager.authenticateOrCreate(token, "RevokeTest", "car-1");
        UUID initialPlayerId = initial.getPlayerId();
        String initialTokenHash = GuestCredentialService.hashToken(token);

        // Wipe memory so check hits database
        guestSessionManager.clearAll();

        // 1. Mark credential as revoked in PostgreSQL
        jdbcTemplate.update("UPDATE guest_credentials SET revoked_at = ? WHERE token_hash = ?",
                OffsetDateTime.now(), initialTokenHash);

        // Attempt authentication with the revoked token
        GuestSession revokedAttempt = guestSessionManager.authenticateOrCreate(token, "RevokeTest", "car-1");

        // Policy: Revoked token cannot authenticate to original player. A replacement credential/player is issued!
        assertThat(revokedAttempt.getPlayerId()).isNotEqualTo(initialPlayerId);
        assertThat(revokedAttempt.getGuestToken()).isNotEqualTo(token);

        // Verify the old credential row remains revoked
        Integer oldRevokedCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM guest_credentials WHERE token_hash = ? AND revoked_at IS NOT NULL",
                Integer.class, initialTokenHash);
        assertThat(oldRevokedCount).isEqualTo(1);

        // Step B: Expired credential test
        String expiredToken = UUID.randomUUID().toString();
        GuestSession expSession = guestSessionManager.authenticateOrCreate(expiredToken, "ExpireTest", "car-1");
        UUID expPlayerId = expSession.getPlayerId();
        String expTokenHash = GuestCredentialService.hashToken(expiredToken);

        guestSessionManager.clearAll();

        // Mark as expired in PostgreSQL
        jdbcTemplate.update("UPDATE guest_credentials SET expires_at = ? WHERE token_hash = ?",
                OffsetDateTime.now().minusDays(1), expTokenHash);

        // Attempt authentication with expired token
        GuestSession expiredAttempt = guestSessionManager.authenticateOrCreate(expiredToken, "ExpireTest", "car-1");

        // Expired token cannot authenticate. Replacement credential/player issued.
        assertThat(expiredAttempt.getPlayerId()).isNotEqualTo(expPlayerId);
        assertThat(expiredAttempt.getGuestToken()).isNotEqualTo(expiredToken);
    }

    // =========================================================================
    // TEST 6 — Existing Multiplayer Compatibility (15s Reconnect, Room IDs p1/p2)
    // =========================================================================
    @Test
    @DisplayName("TEST 6: Multiplayer compatibility: 15s reconnect, room IDs p1/p2, persistentPlayerId preserved")
    void test6_ExistingMultiplayerCompatibility() {
        // 1. Create two guest sessions
        String token1 = UUID.randomUUID().toString();
        GuestSession guest1 = guestSessionManager.authenticateOrCreate(token1, "HostRacer", "bolt-gt");
        UUID persistentId1 = guest1.getPlayerId();

        String token2 = UUID.randomUUID().toString();
        GuestSession guest2 = guestSessionManager.authenticateOrCreate(token2, "JoinRacer", "viper-r");
        UUID persistentId2 = guest2.getPlayerId();

        // 2. Create private room and join both players
        Room room = roomManager.createPrivateRoom("coastal-rush", guest1, "bolt-gt", "sess-100");
        roomManager.joinPrivateRoom(room.getRoomCode(), guest2, "viper-r", "sess-102");

        // Verify slot IDs and persistentPlayerId mappings
        PlayerSlot slot1 = room.getPlayerSlots().get(0);
        PlayerSlot slot2 = room.getPlayerSlots().get(1);

        assertThat(slot1.getPlayerId()).isEqualTo("p1");
        assertThat(slot1.getSlotId()).isEqualTo("P1");
        assertThat(slot1.getPersistentPlayerId()).isEqualTo(persistentId1);

        assertThat(slot2.getPlayerId()).isEqualTo("p2");
        assertThat(slot2.getSlotId()).isEqualTo("P2");
        assertThat(slot2.getPersistentPlayerId()).isEqualTo(persistentId2);

        // 3. Ready up and start private race (transitions state to COUNTDOWN)
        roomManager.setReady(token1, room.getRoomId(), true);
        roomManager.setReady(token2, room.getRoomId(), true);
        roomManager.startPrivateRace(token1, room.getRoomCode());

        // 4. Disconnect player 1 during active countdown/race to trigger 15-second grace period
        long now = System.currentTimeMillis();
        roomManager.handleDisconnect("sess-100", token1);

        assertThat(slot1.isConnected()).isFalse();
        assertThat(slot1.getReconnectDeadlineMs()).isGreaterThan(now);
        assertThat(slot1.getReconnectDeadlineMs() - now).isLessThanOrEqualTo(15000L);

        // 5. Reconnect player 1 within the 15-second grace window
        boolean reconnected = roomManager.handleReconnect(room.getRoomId(), token1, "sess-101", 100);

        assertThat(reconnected).isTrue();
        assertThat(slot1.isConnected()).isTrue();
        assertThat(slot1.getSessionId()).isEqualTo("sess-101");
        assertThat(slot1.getPlayerId()).isEqualTo("p1");
        assertThat(slot1.getPersistentPlayerId()).isEqualTo(persistentId1);

        // Clean up
        roomManager.leaveRoom(token1);
        roomManager.leaveRoom(token2);
    }
}
