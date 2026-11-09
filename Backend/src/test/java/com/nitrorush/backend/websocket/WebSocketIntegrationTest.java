package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.session.GuestSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Tag("integration")
class WebSocketIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private ConnectionManager connectionManager;

    @Autowired
    private GuestSessionManager guestSessionManager;

    private ObjectMapper objectMapper;
    private StandardWebSocketClient client;
    private String wsUri;
    private WebSocketHttpHeaders headers;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        client = new StandardWebSocketClient();
        wsUri = "ws://127.0.0.1:" + port + "/ws/game";

        headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:5173");
    }

    private static class TestClientHandler extends TextWebSocketHandler {
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
    }

    @Test
    @DisplayName("Valid WebSocket handshake succeeds and server immediately sends CONNECTION_ACCEPTED")
    void testConnectionHandshakeAndWelcome() throws Exception {
        TestClientHandler handler = new TestClientHandler();
        client.execute(handler, headers, URI.create(wsUri));

        WebSocketSession session = handler.openFuture.get(5, TimeUnit.SECONDS);
        assertThat(session.isOpen()).isTrue();

        String welcomeMsg = handler.messages.poll(5, TimeUnit.SECONDS);
        assertThat(welcomeMsg).isNotNull();

        JsonNode json = objectMapper.readTree(welcomeMsg);
        assertThat(json.get("protocolVersion").asText()).isEqualTo("1.0");
        assertThat(json.get("type").asText()).isEqualTo("CONNECTION_ACCEPTED");
        String serverSessionId = json.get("payload").get("sessionId").asText();
        assertThat(serverSessionId).isNotBlank();
        assertThat(connectionManager.getConnection(serverSessionId)).isPresent();
        assertThat(json.get("payload").get("heartbeatIntervalMs").asLong()).isEqualTo(10000L);

        session.close();
    }

    @Test
    @DisplayName("PING message receives standard documented PONG response with timestamps")
    void testPingPongHeartbeat() throws Exception {
        TestClientHandler handler = new TestClientHandler();
        client.execute(handler, headers, URI.create(wsUri));

        WebSocketSession session = handler.openFuture.get(5, TimeUnit.SECONDS);
        handler.messages.poll(5, TimeUnit.SECONDS); // Discard welcome

        long clientTs = System.currentTimeMillis();
        String pingJson = String.format("""
                {
                  "protocolVersion": "1.0",
                  "type": "PING",
                  "timestamp": %d,
                  "payload": {
                    "clientTimestamp": %d
                  }
                }
                """, clientTs, clientTs);

        session.sendMessage(new TextMessage(pingJson));

        String pongMsg = handler.messages.poll(5, TimeUnit.SECONDS);
        assertThat(pongMsg).isNotNull();

        JsonNode json = objectMapper.readTree(pongMsg);
        assertThat(json.get("type").asText()).isEqualTo("PONG");
        assertThat(json.get("payload").get("clientTimestamp").asLong()).isEqualTo(clientTs);
        assertThat(json.get("payload").get("serverTimestamp").asLong()).isGreaterThanOrEqualTo(clientTs);

        session.close();
    }

    @Test
    @DisplayName("AUTHENTICATE_GUEST registers guest identity and returns AUTHENTICATION_RESULT")
    void testGuestAuthenticationFlow() throws Exception {
        TestClientHandler handler = new TestClientHandler();
        client.execute(handler, headers, URI.create(wsUri));

        WebSocketSession session = handler.openFuture.get(5, TimeUnit.SECONDS);
        handler.messages.poll(5, TimeUnit.SECONDS); // Discard welcome

        String authJson = """
                {
                  "protocolVersion": "1.0",
                  "type": "AUTHENTICATE_GUEST",
                  "timestamp": 1730985600050,
                  "payload": {
                    "displayName": "SpeedDemon"
                  }
                }
                """;

        session.sendMessage(new TextMessage(authJson));

        String resultMsg = handler.messages.poll(5, TimeUnit.SECONDS);
        assertThat(resultMsg).isNotNull();

        JsonNode json = objectMapper.readTree(resultMsg);
        assertThat(json.get("type").asText()).isEqualTo("AUTHENTICATION_RESULT");
        assertThat(json.get("payload").get("success").asBoolean()).isTrue();
        assertThat(json.get("payload").get("displayName").asText()).isEqualTo("SpeedDemon");

        String token = json.get("payload").get("guestToken").asText();
        assertThat(token).isNotBlank();
        assertThat(guestSessionManager.isValidToken(token)).isTrue();
        assertThat(connectionManager.getConnectionByGuestToken(token)).isPresent();

        session.close();
    }

    @Test
    @DisplayName("Malformed JSON frame does not crash server and returns documented ERROR envelope")
    void testMalformedJsonReturnsError() throws Exception {
        TestClientHandler handler = new TestClientHandler();
        client.execute(handler, headers, URI.create(wsUri));

        WebSocketSession session = handler.openFuture.get(5, TimeUnit.SECONDS);
        handler.messages.poll(5, TimeUnit.SECONDS); // Discard welcome

        session.sendMessage(new TextMessage("Not A Valid JSON Payload"));

        String errMsg = handler.messages.poll(5, TimeUnit.SECONDS);
        assertThat(errMsg).isNotNull();

        JsonNode json = objectMapper.readTree(errMsg);
        assertThat(json.get("type").asText()).isEqualTo("ERROR");
        assertThat(json.get("payload").get("errorCode").asText()).isEqualTo("INVALID_PAYLOAD");

        session.close();
    }

    @Test
    @DisplayName("Closing WebSocket connection removes session from ConnectionManager")
    void testConnectionClosureCleanup() throws Exception {
        TestClientHandler handler = new TestClientHandler();
        client.execute(handler, headers, URI.create(wsUri));

        WebSocketSession session = handler.openFuture.get(5, TimeUnit.SECONDS);
        String welcomeMsg = handler.messages.poll(5, TimeUnit.SECONDS);
        assertThat(welcomeMsg).isNotNull();
        JsonNode json = objectMapper.readTree(welcomeMsg);
        String serverSessionId = json.get("payload").get("sessionId").asText();
        assertThat(connectionManager.getConnection(serverSessionId)).isPresent();

        session.close(CloseStatus.NORMAL);
        handler.closeFuture.get(5, TimeUnit.SECONDS);

        // Allow handler cleanup to finish
        Thread.sleep(150);
        assertThat(connectionManager.getConnection(serverSessionId)).isEmpty();
    }

    @Test
    @DisplayName("Multiple simultaneous connections operate concurrently without corrupting connection manager")
    void testSimultaneousConnections() throws Exception {
        int connectionCount = 10;
        List<WebSocketSession> sessions = new ArrayList<>();
        List<TestClientHandler> handlers = new ArrayList<>();

        for (int i = 0; i < connectionCount; i++) {
            TestClientHandler handler = new TestClientHandler();
            handlers.add(handler);
            client.execute(handler, headers, URI.create(wsUri));
        }

        for (TestClientHandler handler : handlers) {
            WebSocketSession s = handler.openFuture.get(5, TimeUnit.SECONDS);
            sessions.add(s);
            String welcome = handler.messages.poll(5, TimeUnit.SECONDS);
            assertThat(welcome).isNotNull();
        }

        assertThat(connectionManager.getConnectionCount()).isGreaterThanOrEqualTo(connectionCount);

        for (WebSocketSession s : sessions) {
            s.close();
        }
    }
}
