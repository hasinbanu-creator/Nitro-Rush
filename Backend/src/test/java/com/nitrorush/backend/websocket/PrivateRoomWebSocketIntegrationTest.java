package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.matchmaking.MatchmakingService;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageType;
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
import java.util.List;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Tag("integration")
public class PrivateRoomWebSocketIntegrationTest {

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
            return awaitMatchingMessage(type, n -> true, timeoutMs);
        }

        public JsonNode awaitMatchingMessage(String type, java.util.function.Predicate<JsonNode> filter, long timeoutMs) throws Exception {
            long deadline = System.currentTimeMillis() + timeoutMs;
            ObjectMapper mapper = new ObjectMapper();
            while (System.currentTimeMillis() < deadline) {
                long remaining = deadline - System.currentTimeMillis();
                String raw = messages.poll(Math.max(10, remaining), TimeUnit.MILLISECONDS);
                if (raw != null) {
                    JsonNode node = mapper.readTree(raw);
                    if (node.has("type") && type.equals(node.get("type").asText()) && filter.test(node)) {
                        return node;
                    }
                }
            }
            throw new TimeoutException("Timed out waiting for matching message of type: " + type);
        }
    }

    private TestClientHandler connectAndAuth(String displayName) throws Exception {
        TestClientHandler handler = new TestClientHandler();
        WebSocketSession session = client.execute(handler, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
        sessionsToClose.add(session);

        // Await CONNECTION_ACCEPTED
        handler.awaitMessageOfType("CONNECTION_ACCEPTED", 5000);

        // Send AUTHENTICATE_GUEST
        String authMsg = objectMapper.writeValueAsString(new TestAuthEnvelope(displayName));
        session.sendMessage(new TextMessage(authMsg));

        // Await AUTHENTICATION_RESULT
        handler.awaitMessageOfType("AUTHENTICATION_RESULT", 5000);
        return handler;
    }

    private static class TestAuthEnvelope {
        public String protocolVersion = "1.0";
        public String type = "AUTHENTICATE_GUEST";
        public Object payload;

        public TestAuthEnvelope(String displayName) {
            this.payload = new AuthPayload(displayName);
        }

        record AuthPayload(String displayName) {}
    }

    private void sendMessage(TestClientHandler handler, String type, Object payload) throws Exception {
        WebSocketSession session = sessionsToClose.get(findSessionIndex(handler));
        var env = new GenericEnvelope(type, payload);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(env)));
    }

    private int findSessionIndex(TestClientHandler handler) {
        for (int i = 0; i < sessionsToClose.size(); i++) {
            // Index correspondence
            return i; // Handled per-call below
        }
        return 0;
    }

    private void sendFromSession(WebSocketSession session, String type, Object payload) throws Exception {
        var env = new GenericEnvelope(type, payload);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(env)));
    }

    private static class GenericEnvelope {
        public String protocolVersion = "1.0";
        public String type;
        public Object payload;

        public GenericEnvelope(String type, Object payload) {
            this.type = type;
            this.payload = payload;
        }
    }

    record CreatePayload(String preferredTrackId, String preferredCarId) {}
    record JoinPayload(String roomCode, String preferredCarId) {}
    record SelectCarPayload(String carId, String roomId) {}
    record ReadyPayload(boolean isReady, String roomId) {}
    record StartRacePayload(String roomCode, String roomId) {}

    @Test
    @DisplayName("WS 1: Create private room generates valid room code and assigns P1 host")
    public void testCreatePrivateRoomOverWebSocket() throws Exception {
        TestClientHandler hostHandler = connectAndAuth("HostPlayer");
        WebSocketSession hostSession = sessionsToClose.get(0);

        sendFromSession(hostSession, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));

        JsonNode created = hostHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        JsonNode payload = created.get("payload");

        assertNotNull(payload);
        String roomCode = payload.get("roomCode").asText();
        assertNotNull(roomCode);
        assertEquals(6, roomCode.length());
        assertEquals("P1", payload.get("slotId").asText());
        assertEquals("p1", payload.get("hostPlayerId").asText());
        assertEquals(1, payload.get("players").size());
    }

    @Test
    @DisplayName("WS 2: Join private room by code syncs player slot and broadcasts PRIVATE_ROOM_UPDATED")
    public void testJoinPrivateRoomOverWebSocket() throws Exception {
        TestClientHandler hostHandler = connectAndAuth("HostPlayer");
        WebSocketSession hostSession = sessionsToClose.get(0);

        sendFromSession(hostSession, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode created = hostHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String roomCode = created.get("payload").get("roomCode").asText();

        TestClientHandler p2Handler = connectAndAuth("FriendPlayer");
        WebSocketSession p2Session = sessionsToClose.get(1);

        sendFromSession(p2Session, "JOIN_PRIVATE_ROOM", new JoinPayload(roomCode, "viper-r"));

        JsonNode joined = p2Handler.awaitMessageOfType("PRIVATE_ROOM_JOINED", 5000);
        JsonNode joinedPayload = joined.get("payload");
        assertEquals("P2", joinedPayload.get("slotId").asText());
        assertEquals("p1", joinedPayload.get("hostPlayerId").asText());
        assertEquals(2, joinedPayload.get("players").size());

        // Host receives PRIVATE_ROOM_UPDATED
        JsonNode hostUpdated = hostHandler.awaitMessageOfType("PRIVATE_ROOM_UPDATED", 5000);
        assertEquals(2, hostUpdated.get("payload").get("totalPlayers").asInt());
        assertEquals("p1", hostUpdated.get("payload").get("hostPlayerId").asText());
    }

    @Test
    @DisplayName("WS 3: Car selection and ready toggling syncs status across all members")
    public void testVehicleSelectionAndReadySyncOverWebSocket() throws Exception {
        TestClientHandler hostHandler = connectAndAuth("HostPlayer");
        WebSocketSession hostSession = sessionsToClose.get(0);
        sendFromSession(hostSession, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode created = hostHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String roomCode = created.get("payload").get("roomCode").asText();
        String roomId = created.get("payload").get("roomId").asText();

        TestClientHandler p2Handler = connectAndAuth("FriendPlayer");
        WebSocketSession p2Session = sessionsToClose.get(1);
        sendFromSession(p2Session, "JOIN_PRIVATE_ROOM", new JoinPayload(roomCode, "bolt-gt"));
        p2Handler.awaitMessageOfType("PRIVATE_ROOM_JOINED", 5000);

        // Host selects new car
        sendFromSession(hostSession, "SELECT_CAR", new SelectCarPayload("rally-apex", roomId));

        // Host readies up
        sendFromSession(hostSession, "PLAYER_READY", new ReadyPayload(true, roomId));
        JsonNode p2Update1 = p2Handler.awaitMatchingMessage("PRIVATE_ROOM_UPDATED",
                n -> n.get("payload").get("readyCount").asInt() == 1, 5000);
        assertEquals(1, p2Update1.get("payload").get("readyCount").asInt());
        assertFalse(p2Update1.get("payload").get("allReady").asBoolean());

        // P2 readies up
        sendFromSession(p2Session, "PLAYER_READY", new ReadyPayload(true, roomId));
        JsonNode hostUpdate2 = hostHandler.awaitMatchingMessage("PRIVATE_ROOM_UPDATED",
                n -> n.get("payload").get("readyCount").asInt() == 2, 5000);
        assertEquals(2, hostUpdate2.get("payload").get("readyCount").asInt());
        assertTrue(hostUpdate2.get("payload").get("allReady").asBoolean());
    }

    @Test
    @DisplayName("WS 4: Non-host player attempting to start race receives PRIVATE_ROOM_ERROR (NOT_ROOM_HOST)")
    public void testNonHostCannotStartPrivateRaceOverWebSocket() throws Exception {
        TestClientHandler hostHandler = connectAndAuth("HostPlayer");
        WebSocketSession hostSession = sessionsToClose.get(0);
        sendFromSession(hostSession, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode created = hostHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String roomCode = created.get("payload").get("roomCode").asText();
        String roomId = created.get("payload").get("roomId").asText();

        TestClientHandler p2Handler = connectAndAuth("FriendPlayer");
        WebSocketSession p2Session = sessionsToClose.get(1);
        sendFromSession(p2Session, "JOIN_PRIVATE_ROOM", new JoinPayload(roomCode, "bolt-gt"));
        p2Handler.awaitMessageOfType("PRIVATE_ROOM_JOINED", 5000);

        sendFromSession(hostSession, "PLAYER_READY", new ReadyPayload(true, roomId));
        sendFromSession(p2Session, "PLAYER_READY", new ReadyPayload(true, roomId));

        // Non-host (P2) attempts to start race
        sendFromSession(p2Session, "START_PRIVATE_RACE", new StartRacePayload(roomCode, roomId));

        JsonNode err = p2Handler.awaitMessageOfType("PRIVATE_ROOM_ERROR", 5000);
        assertEquals("NOT_ROOM_HOST", err.get("payload").get("errorCode").asText());
    }

    @Test
    @DisplayName("WS 5: Host starts race and transitions all members to COUNTDOWN_STARTED")
    public void testHostStartsPrivateRaceOverWebSocket() throws Exception {
        TestClientHandler hostHandler = connectAndAuth("HostPlayer");
        WebSocketSession hostSession = sessionsToClose.get(0);
        sendFromSession(hostSession, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode created = hostHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String roomCode = created.get("payload").get("roomCode").asText();
        String roomId = created.get("payload").get("roomId").asText();

        TestClientHandler p2Handler = connectAndAuth("FriendPlayer");
        WebSocketSession p2Session = sessionsToClose.get(1);
        sendFromSession(p2Session, "JOIN_PRIVATE_ROOM", new JoinPayload(roomCode, "bolt-gt"));
        p2Handler.awaitMessageOfType("PRIVATE_ROOM_JOINED", 5000);

        sendFromSession(hostSession, "PLAYER_READY", new ReadyPayload(true, roomId));
        sendFromSession(p2Session, "PLAYER_READY", new ReadyPayload(true, roomId));

        // Host starts race
        sendFromSession(hostSession, "START_PRIVATE_RACE", new StartRacePayload(roomCode, roomId));

        JsonNode hostCountdown = hostHandler.awaitMessageOfType("COUNTDOWN_STARTED", 5000);
        JsonNode p2Countdown = p2Handler.awaitMessageOfType("COUNTDOWN_STARTED", 5000);

        assertEquals(3, hostCountdown.get("payload").get("durationSeconds").asInt());
        assertEquals(3, p2Countdown.get("payload").get("durationSeconds").asInt());
    }

    @Test
    @DisplayName("WS 6: Two separate private rooms operate with complete isolation")
    public void testTwoPrivateRoomsAreIsolated() throws Exception {
        TestClientHandler hostAHandler = connectAndAuth("HostA");
        WebSocketSession sessionA = sessionsToClose.get(0);
        sendFromSession(sessionA, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode createdA = hostAHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String codeA = createdA.get("payload").get("roomCode").asText();

        TestClientHandler hostBHandler = connectAndAuth("HostB");
        WebSocketSession sessionB = sessionsToClose.get(1);
        sendFromSession(sessionB, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode createdB = hostBHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String codeB = createdB.get("payload").get("roomCode").asText();

        assertNotEquals(codeA, codeB, "Room codes must be distinct");

        // Player joins Room A
        TestClientHandler joinerHandler = connectAndAuth("JoinerA");
        WebSocketSession sessionJoiner = sessionsToClose.get(2);
        sendFromSession(sessionJoiner, "JOIN_PRIVATE_ROOM", new JoinPayload(codeA, "viper-r"));

        JsonNode joinedA = joinerHandler.awaitMessageOfType("PRIVATE_ROOM_JOINED", 5000);
        assertEquals(codeA, joinedA.get("payload").get("roomCode").asText());

        // Room B host never sees joiner
        assertTrue(hostBHandler.messages.stream().noneMatch(m -> m.contains("JoinerA")));
    }

    record InputPayload(String roomId, long sequenceNumber, double throttle, double steer, double brake, boolean handbrake, boolean nitro) {}

    @Test
    @DisplayName("WS 7: End-to-end 2-player private race: countdown, input streaming, snapshot reception")
    public void testCompletePrivateRaceOverWebSocket() throws Exception {
        TestClientHandler hostHandler = connectAndAuth("HostPlayer");
        WebSocketSession hostSession = sessionsToClose.get(0);
        sendFromSession(hostSession, "CREATE_PRIVATE_ROOM", new CreatePayload("coastal-rush", "bolt-gt"));
        JsonNode created = hostHandler.awaitMessageOfType("PRIVATE_ROOM_CREATED", 5000);
        String roomCode = created.get("payload").get("roomCode").asText();
        String roomId = created.get("payload").get("roomId").asText();

        TestClientHandler p2Handler = connectAndAuth("FriendPlayer");
        WebSocketSession p2Session = sessionsToClose.get(1);
        sendFromSession(p2Session, "JOIN_PRIVATE_ROOM", new JoinPayload(roomCode, "bolt-gt"));
        p2Handler.awaitMessageOfType("PRIVATE_ROOM_JOINED", 5000);

        sendFromSession(hostSession, "PLAYER_READY", new ReadyPayload(true, roomId));
        sendFromSession(p2Session, "PLAYER_READY", new ReadyPayload(true, roomId));

        // Host starts race
        sendFromSession(hostSession, "START_PRIVATE_RACE", new StartRacePayload(roomCode, roomId));

        // Both receive COUNTDOWN_STARTED
        hostHandler.awaitMessageOfType("COUNTDOWN_STARTED", 5000);
        p2Handler.awaitMessageOfType("COUNTDOWN_STARTED", 5000);

        // Wait for RACE_STARTED (after 3s countdown)
        JsonNode hostRaceStarted = hostHandler.awaitMessageOfType("RACE_STARTED", 6000);
        JsonNode p2RaceStarted = p2Handler.awaitMessageOfType("RACE_STARTED", 6000);
        assertNotNull(hostRaceStarted);
        assertNotNull(p2RaceStarted);

        // Stream inputs from both players
        for (int i = 1; i <= 5; i++) {
            sendFromSession(hostSession, "PLAYER_INPUT", new InputPayload(roomId, i, 1.0, 0.0, 0.0, false, false));
            sendFromSession(p2Session, "PLAYER_INPUT", new InputPayload(roomId, i, 0.8, 0.0, 0.0, false, false));
            Thread.sleep(25);
        }

        // Both receive authoritative RACE_STATE snapshots
        JsonNode hostSnapshot = hostHandler.awaitMessageOfType("RACE_STATE", 5000);
        JsonNode p2Snapshot = p2Handler.awaitMessageOfType("RACE_STATE", 5000);

        assertNotNull(hostSnapshot);
        assertNotNull(p2Snapshot);
        assertTrue(hostSnapshot.get("payload").has("vehicles"));
        assertEquals(2, hostSnapshot.get("payload").get("vehicles").size());
    }
}
