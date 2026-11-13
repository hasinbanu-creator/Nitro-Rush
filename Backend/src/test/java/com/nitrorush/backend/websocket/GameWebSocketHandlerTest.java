package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.config.NitroRushProperties;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.ConnectionAcceptedPayload;
import com.nitrorush.backend.protocol.payload.ErrorPayload;
import com.nitrorush.backend.session.GuestSession;
import com.nitrorush.backend.session.GuestSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.net.InetSocketAddress;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class GameWebSocketHandlerTest {

    private ConnectionManager connectionManager;
    private GuestSessionManager guestSessionManager;
    private com.nitrorush.backend.room.RoomManager roomManager;
    private NitroRushProperties properties;
    private ObjectMapper objectMapper;
    private GameWebSocketHandler handler;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        connectionManager = new ConnectionManager(objectMapper);
        properties = new NitroRushProperties();
        guestSessionManager = new GuestSessionManager(properties);
        com.nitrorush.backend.physics.track.TrackRegistry trackRegistry = new com.nitrorush.backend.physics.track.TrackRegistry();
        com.nitrorush.backend.common.SystemTimeProvider timeProvider = new com.nitrorush.backend.common.SystemTimeProvider();
        com.nitrorush.backend.room.WebSocketMessageBroadcaster broadcaster = new com.nitrorush.backend.room.WebSocketMessageBroadcaster(connectionManager);
        roomManager = new com.nitrorush.backend.room.RoomManager(trackRegistry, timeProvider, broadcaster);
        com.nitrorush.backend.matchmaking.MatchmakingService matchmakingService =
                new com.nitrorush.backend.matchmaking.MatchmakingService(roomManager, timeProvider, broadcaster);
        handler = new GameWebSocketHandler(connectionManager, guestSessionManager, roomManager, matchmakingService, properties, objectMapper);
    }

    private WebSocketSession createMockSession(String sessionId) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(sessionId);
        when(session.isOpen()).thenReturn(true);
        when(session.getRemoteAddress()).thenReturn(new InetSocketAddress("127.0.0.1", 54321));
        return session;
    }

    @Test
    @DisplayName("afterConnectionEstablished registers session and sends CONNECTION_ACCEPTED envelope")
    void testConnectionEstablishedWelcome() throws IOException {
        WebSocketSession session = createMockSession("sess-welcome");

        handler.afterConnectionEstablished(session);

        assertThat(connectionManager.getConnection("sess-welcome")).isPresent();

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeastOnce()).sendMessage(captor.capture());

        TextMessage sent = captor.getValue();
        JsonNode json = objectMapper.readTree(sent.getPayload());
        assertThat(json.get("protocolVersion").asText()).isEqualTo("1.0");
        assertThat(json.get("type").asText()).isEqualTo(MessageType.CONNECTION_ACCEPTED.name());
        assertThat(json.get("payload").get("sessionId").asText()).isEqualTo("sess-welcome");
        assertThat(json.get("payload").get("heartbeatIntervalMs").asLong()).isEqualTo(10000L);
    }

    @Test
    @DisplayName("PING frame receives standard PONG response with preserved clientTimestamp")
    void testPingReceivesPong() throws IOException {
        WebSocketSession session = createMockSession("sess-ping");
        handler.afterConnectionEstablished(session);

        long clientTs = 1730985600123L;
        String pingEnvelope = String.format("""
                {
                  "protocolVersion": "1.0",
                  "type": "PING",
                  "timestamp": %d,
                  "payload": {
                    "clientTimestamp": %d
                  }
                }
                """, clientTs, clientTs);

        handler.handleTextMessage(session, new TextMessage(pingEnvelope));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.PONG.name());
        assertThat(json.get("payload").get("clientTimestamp").asLong()).isEqualTo(clientTs);
        assertThat(json.get("payload").get("serverTimestamp").asLong()).isGreaterThanOrEqualTo(clientTs);
    }

    @Test
    @DisplayName("AUTHENTICATE_GUEST creates guest identity, binds token and sends AUTHENTICATION_RESULT")
    void testAuthenticateGuest() throws IOException {
        WebSocketSession session = createMockSession("sess-auth");
        handler.afterConnectionEstablished(session);

        String authJson = """
                {
                  "protocolVersion": "1.0",
                  "type": "AUTHENTICATE_GUEST",
                  "timestamp": 1730985600050,
                  "payload": {
                    "displayName": "ApexDriver",
                    "avatarId": "helmet-gold"
                  }
                }
                """;

        handler.handleTextMessage(session, new TextMessage(authJson));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.AUTHENTICATION_RESULT.name());
        assertThat(json.get("payload").get("success").asBoolean()).isTrue();
        String token = json.get("payload").get("guestToken").asText();
        assertThat(token).isNotBlank();
        assertThat(token).hasSize(36);
        assertThat(json.get("payload").get("displayName").asText()).isEqualTo("ApexDriver");

        assertThat(connectionManager.getConnectionByGuestToken(token)).isPresent();
    }

    @Test
    @DisplayName("AUTHENTICATE_GUEST with empty displayName returns standard ERROR envelope")
    void testAuthenticateGuestMissingName() throws IOException {
        WebSocketSession session = createMockSession("sess-err-name");
        handler.afterConnectionEstablished(session);

        String invalidAuthJson = """
                {
                  "protocolVersion": "1.0",
                  "type": "AUTHENTICATE_GUEST",
                  "timestamp": 1730985600050,
                  "payload": {
                    "displayName": "   "
                  }
                }
                """;

        handler.handleTextMessage(session, new TextMessage(invalidAuthJson));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.ERROR.name());
        assertThat(json.get("payload").get("errorCode").asText()).isEqualTo(ErrorCode.INVALID_PAYLOAD.name());
    }

    @Test
    @DisplayName("Malformed JSON returns standard ERROR envelope without crashing handler")
    void testMalformedJsonReturnsError() throws IOException {
        WebSocketSession session = createMockSession("sess-malformed");
        handler.afterConnectionEstablished(session);

        handler.handleTextMessage(session, new TextMessage("Not a valid JSON {{{ frame"));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.ERROR.name());
        assertThat(json.get("payload").get("errorCode").asText()).isEqualTo(ErrorCode.INVALID_PAYLOAD.name());
    }

    @Test
    @DisplayName("Unsupported protocol version returns INVALID_PROTOCOL_VERSION error envelope")
    void testUnsupportedProtocolVersionReturnsError() throws IOException {
        WebSocketSession session = createMockSession("sess-version");
        handler.afterConnectionEstablished(session);

        String badVersionJson = """
                {
                  "protocolVersion": "9.9",
                  "type": "PING",
                  "timestamp": 1730985600000,
                  "payload": { "clientTimestamp": 1730985600000 }
                }
                """;

        handler.handleTextMessage(session, new TextMessage(badVersionJson));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.ERROR.name());
        assertThat(json.get("payload").get("errorCode").asText()).isEqualTo(ErrorCode.INVALID_PROTOCOL_VERSION.name());
    }

    @Test
    @DisplayName("Frame exceeding maxFrameSize limit returns error")
    void testExceedsMaxFrameSize() throws IOException {
        WebSocketSession session = createMockSession("sess-oversized");
        handler.afterConnectionEstablished(session);

        String oversizedPayload = "x".repeat(5000);
        handler.handleTextMessage(session, new TextMessage(oversizedPayload));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.ERROR.name());
        assertThat(json.get("payload").get("errorCode").asText()).isEqualTo(ErrorCode.INVALID_PAYLOAD.name());
    }

    @Test
    @DisplayName("Client sending server-to-client message type returns directionality error")
    void testServerOutboundMessageTypeRejected() throws IOException {
        WebSocketSession session = createMockSession("sess-direction");
        handler.afterConnectionEstablished(session);

        String badDirectionJson = """
                {
                  "protocolVersion": "1.0",
                  "type": "RACE_STATE",
                  "timestamp": 1730985600000,
                  "payload": {}
                }
                """;

        handler.handleTextMessage(session, new TextMessage(badDirectionJson));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeast(2)).sendMessage(captor.capture());

        TextMessage lastSent = captor.getAllValues().get(captor.getAllValues().size() - 1);
        JsonNode json = objectMapper.readTree(lastSent.getPayload());
        assertThat(json.get("type").asText()).isEqualTo(MessageType.ERROR.name());
        assertThat(json.get("payload").get("errorCode").asText()).isEqualTo(ErrorCode.INVALID_PAYLOAD.name());
    }

    @Test
    @DisplayName("afterConnectionClosed cleanly removes connection from ConnectionManager")
    void testConnectionClosedCleansUp() {
        WebSocketSession session = createMockSession("sess-close");
        handler.afterConnectionEstablished(session);
        assertThat(connectionManager.getConnection("sess-close")).isPresent();

        handler.afterConnectionClosed(session, CloseStatus.NORMAL);
        assertThat(connectionManager.getConnection("sess-close")).isEmpty();
    }
}
