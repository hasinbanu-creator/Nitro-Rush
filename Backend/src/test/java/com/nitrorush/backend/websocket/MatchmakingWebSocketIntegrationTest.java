package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.matchmaking.MatchmakingService;
import com.nitrorush.backend.room.RoomManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Tag("integration")
public class MatchmakingWebSocketIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private RoomManager roomManager;

    @Autowired
    private MatchmakingService matchmakingService;

    private ObjectMapper objectMapper;
    private StandardWebSocketClient client;
    private String wsUri;
    private WebSocketHttpHeaders headers;
    private final List<WebSocketSession> sessionsToClose = new CopyOnWriteArrayList<>();

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        client = new StandardWebSocketClient();
        wsUri = "ws://127.0.0.1:" + port + "/ws/game";

        headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:5173");
        matchmakingService.clear();
    }

    @AfterEach
    void tearDown() {
        for (WebSocketSession session : sessionsToClose) {
            try {
                if (session != null && session.isOpen()) {
                    session.close();
                }
            } catch (Exception ignored) {
            }
        }
        sessionsToClose.clear();
        matchmakingService.clear();
    }

    private static class TestClientHandler extends TextWebSocketHandler {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.offer(message.getPayload());
        }

        public JsonNode awaitMessageOfType(String type, long timeoutMs) throws Exception {
            long deadline = System.currentTimeMillis() + timeoutMs;
            ObjectMapper mapper = new ObjectMapper();
            while (System.currentTimeMillis() < deadline) {
                long remaining = deadline - System.currentTimeMillis();
                String raw = messages.poll(Math.max(10, remaining), TimeUnit.MILLISECONDS);
                if (raw != null) {
                    JsonNode node = mapper.readTree(raw);
                    if (node.has("type") && type.equals(node.get("type").asText())) {
                        return node;
                    }
                }
            }
            return null;
        }

        public JsonNode awaitMatchmakingStatus(String expectedStatus, long timeoutMs) throws Exception {
            long deadline = System.currentTimeMillis() + timeoutMs;
            ObjectMapper mapper = new ObjectMapper();
            while (System.currentTimeMillis() < deadline) {
                long remaining = deadline - System.currentTimeMillis();
                String raw = messages.poll(Math.max(10, remaining), TimeUnit.MILLISECONDS);
                if (raw != null) {
                    JsonNode node = mapper.readTree(raw);
                    if (node.has("type") && "MATCHMAKING_STATUS".equals(node.get("type").asText())) {
                        if (node.has("payload") && node.get("payload").has("status")
                                && expectedStatus.equals(node.get("payload").get("status").asText())) {
                            return node;
                        }
                    }
                }
            }
            return null;
        }
    }

    private WebSocketSession connectClient(TestClientHandler handler) throws Exception {
        WebSocketSession session = client.execute(handler, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
        sessionsToClose.add(session);
        return session;
    }

    private String authenticate(WebSocketSession session, TestClientHandler handler, String name) throws Exception {
        handler.awaitMessageOfType("CONNECTION_ACCEPTED", 3000);

        String authMsg = """
            {
              "protocolVersion": "1.0",
              "type": "AUTHENTICATE_GUEST",
              "timestamp": %d,
              "payload": {
                "displayName": "%s"
              }
            }
            """.formatted(System.currentTimeMillis(), name);

        session.sendMessage(new TextMessage(authMsg));
        JsonNode authResult = handler.awaitMessageOfType("AUTHENTICATION_RESULT", 3000);
        assertNotNull(authResult, "Authentication result must not be null");
        assertTrue(authResult.get("payload").get("success").asBoolean());
        return authResult.get("payload").get("guestToken").asText();
    }

    @Test
    @DisplayName("WebSocket: 1 player queueing, 2nd player triggering collection window, 3rd player joining during window")
    public void testMatchmakingQueueFlowOverWebSocket() throws Exception {
        TestClientHandler h1 = new TestClientHandler();
        WebSocketSession s1 = connectClient(h1);
        String token1 = authenticate(s1, h1, "RacerOne");

        // Client 1 joins global matchmaking without roomId
        String join1 = """
            {
              "protocolVersion": "1.0",
              "type": "JOIN_MATCHMAKING",
              "timestamp": %d,
              "payload": {
                "preferredTrackId": "coastal-rush",
                "preferredCarId": "bolt-gt"
              }
            }
            """.formatted(System.currentTimeMillis());
        s1.sendMessage(new TextMessage(join1));

        // Client 1 receives QUEUED status
        JsonNode status1 = h1.awaitMatchmakingStatus("QUEUED", 3000);
        assertNotNull(status1, "Client 1 must receive QUEUED status");
        assertEquals(1, status1.get("payload").get("position").asInt());
        assertEquals(1, status1.get("payload").get("totalWaiting").asInt());

        // Client 2 connects and authenticates
        TestClientHandler h2 = new TestClientHandler();
        WebSocketSession s2 = connectClient(h2);
        String token2 = authenticate(s2, h2, "RacerTwo");

        // Client 2 joins global matchmaking without roomId
        String join2 = """
            {
              "protocolVersion": "1.0",
              "type": "JOIN_MATCHMAKING",
              "timestamp": %d,
              "payload": {
                "preferredTrackId": "coastal-rush",
                "preferredCarId": "viper-r"
              }
            }
            """.formatted(System.currentTimeMillis());
        s2.sendMessage(new TextMessage(join2));

        // Both clients receive COLLECTION_WINDOW status
        JsonNode cw1 = h1.awaitMatchmakingStatus("COLLECTION_WINDOW", 3000);
        assertNotNull(cw1, "Client 1 must receive COLLECTION_WINDOW");
        assertEquals(2, cw1.get("payload").get("totalWaiting").asInt());

        JsonNode cw2 = h2.awaitMatchmakingStatus("COLLECTION_WINDOW", 3000);
        assertNotNull(cw2, "Client 2 must receive COLLECTION_WINDOW");
        assertEquals(2, cw2.get("payload").get("totalWaiting").asInt());
        assertEquals(2, cw2.get("payload").get("position").asInt());

        // Client 3 joins during window
        TestClientHandler h3 = new TestClientHandler();
        WebSocketSession s3 = connectClient(h3);
        String token3 = authenticate(s3, h3, "RacerThree");

        String join3 = """
            {
              "protocolVersion": "1.0",
              "type": "JOIN_MATCHMAKING",
              "timestamp": %d,
              "payload": {
                "preferredTrackId": "coastal-rush",
                "preferredCarId": "rally-apex"
              }
            }
            """.formatted(System.currentTimeMillis());
        s3.sendMessage(new TextMessage(join3));

        JsonNode cw3 = h3.awaitMatchmakingStatus("COLLECTION_WINDOW", 3000);
        assertNotNull(cw3, "Client 3 must receive COLLECTION_WINDOW");
        assertEquals(3, cw3.get("payload").get("position").asInt());
        assertEquals(3, cw3.get("payload").get("totalWaiting").asInt());
    }

    @Test
    @DisplayName("WebSocket: Cancel matchmaking removes player and delivers CANCELLED status")
    public void testCancelMatchmakingOverWebSocket() throws Exception {
        TestClientHandler h1 = new TestClientHandler();
        WebSocketSession s1 = connectClient(h1);
        String token1 = authenticate(s1, h1, "CancelTester");

        // Join queue
        String joinMsg = """
            {
              "protocolVersion": "1.0",
              "type": "JOIN_MATCHMAKING",
              "timestamp": %d,
              "payload": {
                "preferredTrackId": "coastal-rush",
                "preferredCarId": "bolt-gt"
              }
            }
            """.formatted(System.currentTimeMillis());
        s1.sendMessage(new TextMessage(joinMsg));
        assertNotNull(h1.awaitMatchmakingStatus("QUEUED", 3000));

        // Cancel queue
        String cancelMsg = """
            {
              "protocolVersion": "1.0",
              "type": "CANCEL_MATCHMAKING",
              "timestamp": %d,
              "payload": {}
            }
            """.formatted(System.currentTimeMillis());
        s1.sendMessage(new TextMessage(cancelMsg));

        JsonNode cancelStatus = h1.awaitMatchmakingStatus("CANCELLED", 3000);
        assertNotNull(cancelStatus, "Client must receive CANCELLED status notification");
        assertEquals("CANCELLED", cancelStatus.get("payload").get("status").asText());
        assertEquals(0, matchmakingService.getQueueSize());
    }

    @Test
    @DisplayName("WebSocket: 8 players joining triggers immediate room creation and all receive ROOM_ASSIGNED")
    public void testImmediateEightPlayerMatchmakingOverWebSocket() throws Exception {
        List<TestClientHandler> handlers = new ArrayList<>();
        List<WebSocketSession> sessions = new ArrayList<>();

        for (int i = 1; i <= 8; i++) {
            TestClientHandler h = new TestClientHandler();
            WebSocketSession s = connectClient(h);
            authenticate(s, h, "Racer" + i);
            handlers.add(h);
            sessions.add(s);
        }

        // Send JOIN_MATCHMAKING for all 8 clients
        for (int i = 0; i < 8; i++) {
            String joinMsg = """
                {
                  "protocolVersion": "1.0",
                  "type": "JOIN_MATCHMAKING",
                  "timestamp": %d,
                  "payload": {
                    "preferredTrackId": "coastal-rush",
                    "preferredCarId": "bolt-gt"
                  }
                }
                """.formatted(System.currentTimeMillis());
            sessions.get(i).sendMessage(new TextMessage(joinMsg));
        }

        // All 8 must receive ROOM_ASSIGNED with the same roomId and unique slots P1..P8
        Set<String> assignedSlots = new HashSet<>();
        String commonRoomId = null;
        for (int i = 0; i < 8; i++) {
            JsonNode roomAssigned = handlers.get(i).awaitMessageOfType("ROOM_ASSIGNED", 5000);
            assertNotNull(roomAssigned, "Client " + (i + 1) + " must receive ROOM_ASSIGNED");
            String roomId = roomAssigned.get("payload").get("roomId").asText();
            if (commonRoomId == null) {
                commonRoomId = roomId;
            } else {
                assertEquals(commonRoomId, roomId, "All 8 players must be assigned to the same room");
            }
            String slotId = roomAssigned.get("payload").get("slotId").asText();
            assertTrue(slotId.matches("P[1-8]"), "Assigned slot must be between P1 and P8 (got " + slotId + ")");
            assignedSlots.add(slotId);
        }
        assertEquals(8, assignedSlots.size(), "All 8 players must be assigned distinct slots P1 through P8: " + assignedSlots);
    }

    @Test
    @DisplayName("WebSocket: Duplicate queue request rejects with ALREADY_IN_QUEUE")
    public void testDuplicateQueueRejectedOverWebSocket() throws Exception {
        TestClientHandler h1 = new TestClientHandler();
        WebSocketSession s1 = connectClient(h1);
        String token1 = authenticate(s1, h1, "DupTester");

        String joinMsg = """
            {
              "protocolVersion": "1.0",
              "type": "JOIN_MATCHMAKING",
              "timestamp": %d,
              "payload": {
                "preferredTrackId": "coastal-rush",
                "preferredCarId": "bolt-gt"
              }
            }
            """.formatted(System.currentTimeMillis());
        s1.sendMessage(new TextMessage(joinMsg));
        assertNotNull(h1.awaitMatchmakingStatus("QUEUED", 3000));

        // Send duplicate JOIN_MATCHMAKING
        s1.sendMessage(new TextMessage(joinMsg));

        JsonNode err = h1.awaitMessageOfType("ERROR", 3000);
        assertNotNull(err, "Client must receive ERROR envelope on duplicate join");
        assertEquals("ALREADY_IN_QUEUE", err.get("payload").get("errorCode").asText());
    }
}
