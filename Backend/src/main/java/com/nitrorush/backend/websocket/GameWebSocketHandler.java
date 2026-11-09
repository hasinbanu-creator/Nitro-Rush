package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.config.NitroRushProperties;
import com.nitrorush.backend.exception.ProtocolException;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.*;
import com.nitrorush.backend.room.Room;
import com.nitrorush.backend.room.RoomManager;
import com.nitrorush.backend.room.RoomState;
import com.nitrorush.backend.session.GuestSession;
import com.nitrorush.backend.session.GuestSessionManager;
import com.nitrorush.backend.session.PlayerConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Optional;

/**
 * Raw Spring WebSocketHandler processing Nitro Rush client communication.
 * Validates protocol framing, versioning, message schemas, and routes to room services.
 */
@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(GameWebSocketHandler.class);
    private static final String REQUIRED_PROTOCOL_VERSION = "1.0";

    private final ConnectionManager connectionManager;
    private final GuestSessionManager guestSessionManager;
    private final RoomManager roomManager;
    private final NitroRushProperties properties;
    private final ObjectMapper objectMapper;

    public GameWebSocketHandler(ConnectionManager connectionManager,
                                GuestSessionManager guestSessionManager,
                                RoomManager roomManager,
                                NitroRushProperties properties,
                                ObjectMapper objectMapper) {
        this.connectionManager = connectionManager;
        this.guestSessionManager = guestSessionManager;
        this.roomManager = roomManager;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String sessionId = session.getId();
        connectionManager.register(session);

        long heartbeatInterval = properties.getWebsocket().getHeartbeatIntervalMs();
        ConnectionAcceptedPayload payload = new ConnectionAcceptedPayload(sessionId, heartbeatInterval);
        MessageEnvelope<ConnectionAcceptedPayload> welcome = MessageEnvelope.of(
                MessageType.CONNECTION_ACCEPTED, payload);

        connectionManager.send(sessionId, welcome);
        log.info("Client connected and welcomed: sessionId={}", sessionId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String sessionId = session.getId();
        String payloadText = message.getPayload();

        // 1. Frame size validation
        if (payloadText.length() > properties.getWebsocket().getMaxFrameSize()) {
            log.warn("Payload size exceeds maximum allowed frame size ({} > {}) for sessionId={}",
                    payloadText.length(), properties.getWebsocket().getMaxFrameSize(), sessionId);
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD,
                    "Payload exceeds maximum allowed frame limit of " + properties.getWebsocket().getMaxFrameSize() + " bytes");
            return;
        }

        // 2. Parse envelope JSON
        JsonNode rootNode;
        try {
            rootNode = objectMapper.readTree(payloadText);
        } catch (JsonProcessingException e) {
            log.warn("Received malformed JSON from sessionId={}: {}", sessionId, e.getMessage());
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD, "Malformed JSON text frame");
            return;
        }

        if (rootNode == null || !rootNode.isObject()) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD, "Message must be a valid JSON object");
            return;
        }

        // 3. Protocol version validation
        JsonNode versionNode = rootNode.get("protocolVersion");
        if (versionNode == null || !REQUIRED_PROTOCOL_VERSION.equals(versionNode.asText())) {
            String clientVer = versionNode != null ? versionNode.asText() : "null";
            log.warn("Invalid protocol version '{}' from sessionId={}", clientVer, sessionId);
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PROTOCOL_VERSION,
                    "Unsupported protocol version: " + clientVer + ". Required: " + REQUIRED_PROTOCOL_VERSION);
            return;
        }

        // 4. Message type validation
        JsonNode typeNode = rootNode.get("type");
        if (typeNode == null || !typeNode.isTextual()) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD, "Missing 'type' field in message envelope");
            return;
        }

        MessageType messageType;
        try {
            messageType = MessageType.valueOf(typeNode.asText().trim());
        } catch (IllegalArgumentException e) {
            log.warn("Unsupported message type '{}' from sessionId={}", typeNode.asText(), sessionId);
            connectionManager.sendError(sessionId, ErrorCode.UNSUPPORTED_MESSAGE_TYPE,
                    "Unknown message type: " + typeNode.asText());
            return;
        }

        if (!messageType.isClientToServer()) {
            log.warn("Client sent server-outbound message type '{}' on sessionId={}", messageType, sessionId);
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD,
                    "Invalid message direction: " + messageType + " is a server-to-client message");
            return;
        }

        JsonNode payloadNode = rootNode.get("payload");

        try {
            switch (messageType) {
                case CONNECT -> handleConnect(sessionId, payloadNode);
                case AUTHENTICATE_GUEST -> handleAuthenticateGuest(sessionId, payloadNode);
                case PING -> handlePing(sessionId, payloadNode);
                case JOIN_MATCHMAKING -> handleJoinMatchmaking(sessionId, payloadNode);
                case CANCEL_MATCHMAKING -> handleCancelMatchmaking(sessionId, payloadNode);
                case SELECT_CAR -> handleSelectCar(sessionId, payloadNode);
                case PLAYER_READY -> handlePlayerReady(sessionId, payloadNode);
                case PLAYER_INPUT -> handlePlayerInput(sessionId, payloadNode);
                case RECONNECT -> handleReconnect(sessionId, payloadNode);
                default -> {
                    log.info("Unhandled protocol message '{}' on sessionId={}", messageType, sessionId);
                    connectionManager.updateActivity(sessionId);
                }
            }
        } catch (ProtocolException pe) {
            connectionManager.sendError(sessionId, pe.getErrorCode(), pe.getMessage());
        } catch (Exception e) {
            log.error("Internal error handling message {} from sessionId {}: {}", messageType, sessionId, e.getMessage(), e);
            connectionManager.sendError(sessionId, ErrorCode.INTERNAL_ERROR, "Server error: " + e.getMessage());
        }
    }

    private void handleConnect(String sessionId, JsonNode payloadNode) {
        String clientVersion = payloadNode != null && payloadNode.has("clientVersion")
                ? payloadNode.get("clientVersion").asText()
                : "unknown";
        String platform = payloadNode != null && payloadNode.has("platform")
                ? payloadNode.get("platform").asText()
                : "unknown";

        log.debug("Client CONNECT: sessionId={}, clientVersion={}, platform={}", sessionId, clientVersion, platform);

        long heartbeatInterval = properties.getWebsocket().getHeartbeatIntervalMs();
        ConnectionAcceptedPayload payload = new ConnectionAcceptedPayload(sessionId, heartbeatInterval);
        connectionManager.send(sessionId, MessageEnvelope.of(MessageType.CONNECTION_ACCEPTED, payload));
    }

    private void handleAuthenticateGuest(String sessionId, JsonNode payloadNode) {
        if (payloadNode == null || !payloadNode.has("displayName") || payloadNode.get("displayName").asText().isBlank()) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD,
                    "Missing or empty required field 'displayName' in AUTHENTICATE_GUEST payload");
            return;
        }

        String displayName = payloadNode.get("displayName").asText();
        String requestedToken = payloadNode.has("guestToken") ? payloadNode.get("guestToken").asText() : null;
        String avatarId = payloadNode.has("avatarId") ? payloadNode.get("avatarId").asText() : null;

        GuestSession guestSession = guestSessionManager.authenticateOrCreate(requestedToken, displayName, avatarId);
        connectionManager.bindGuestToken(sessionId, guestSession.getGuestToken());

        AuthenticationResultPayload result = new AuthenticationResultPayload(
                true, guestSession.getGuestToken(), guestSession.getDisplayName());

        connectionManager.send(sessionId, MessageEnvelope.of(MessageType.AUTHENTICATION_RESULT, result));
    }

    private void handlePing(String sessionId, JsonNode payloadNode) {
        long clientTimestamp = System.currentTimeMillis();
        if (payloadNode != null && payloadNode.has("clientTimestamp")) {
            clientTimestamp = payloadNode.get("clientTimestamp").asLong();
        }

        long serverTimestamp = System.currentTimeMillis();
        PongPayload pong = new PongPayload(clientTimestamp, serverTimestamp);
        connectionManager.send(sessionId, MessageEnvelope.of(MessageType.PONG, pong));
        connectionManager.updateActivity(sessionId);
    }

    private void handleJoinMatchmaking(String sessionId, JsonNode payloadNode) {
        GuestSession session = getAuthenticatedSession(sessionId);
        if (session == null) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_CREDENTIALS,
                    "Session must be authenticated before joining room");
            return;
        }

        String trackId = payloadNode != null && payloadNode.has("preferredTrackId")
                ? payloadNode.get("preferredTrackId").asText()
                : "coastal-rush";
        String carId = payloadNode != null && payloadNode.has("preferredCarId")
                ? payloadNode.get("preferredCarId").asText()
                : "bolt-gt";
        String explicitRoomId = payloadNode != null && payloadNode.has("roomId")
                ? payloadNode.get("roomId").asText()
                : null;

        Room room = null;
        if (explicitRoomId != null && !explicitRoomId.isBlank()) {
            room = roomManager.getOrCreateRoom(explicitRoomId, trackId);
        } else {
            // Find existing room in WAITING state with capacity, or create new room
            for (Room r : roomManager.getAllRooms()) {
                if (r.getState() == RoomState.WAITING && r.getPlayerCount() < Room.MAX_PLAYERS
                        && r.getTrack().getId().equalsIgnoreCase(trackId)) {
                    room = r;
                    break;
                }
            }
            if (room == null) {
                room = roomManager.createRoom(trackId);
            }
        }

        roomManager.joinRoom(room.getRoomId(), session, carId, sessionId);
    }

    private void handleCancelMatchmaking(String sessionId, JsonNode payloadNode) {
        GuestSession session = getAuthenticatedSession(sessionId);
        if (session == null) {
            connectionManager.sendError(sessionId, ErrorCode.NOT_IN_QUEUE, "Not in queue");
            return;
        }
        roomManager.leaveRoom(session.getGuestToken());
    }

    private void handleSelectCar(String sessionId, JsonNode payloadNode) {
        GuestSession session = getAuthenticatedSession(sessionId);
        if (session == null) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_CREDENTIALS, "Authentication required");
            return;
        }
        if (payloadNode == null || !payloadNode.has("carId")) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD, "Missing carId in SELECT_CAR");
            return;
        }

        String carId = payloadNode.get("carId").asText();
        String roomId = payloadNode.has("roomId") ? payloadNode.get("roomId").asText() : null;
        roomManager.selectCar(session.getGuestToken(), roomId, carId);
    }

    private void handlePlayerReady(String sessionId, JsonNode payloadNode) {
        GuestSession session = getAuthenticatedSession(sessionId);
        if (session == null) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_CREDENTIALS, "Authentication required");
            return;
        }
        if (payloadNode == null || !payloadNode.has("isReady")) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD, "Missing isReady in PLAYER_READY");
            return;
        }

        boolean isReady = payloadNode.get("isReady").asBoolean();
        String roomId = payloadNode.has("roomId") ? payloadNode.get("roomId").asText() : null;
        roomManager.setReady(session.getGuestToken(), roomId, isReady);
    }

    private void handlePlayerInput(String sessionId, JsonNode payloadNode) {
        GuestSession session = getAuthenticatedSession(sessionId);
        if (session == null) return;
        if (payloadNode == null) return;

        try {
            PlayerInputPayload payload = objectMapper.treeToValue(payloadNode, PlayerInputPayload.class);
            roomManager.submitInput(session.getGuestToken(), payload);
        } catch (JsonProcessingException e) {
            log.warn("Invalid PLAYER_INPUT payload from session {}: {}", sessionId, e.getMessage());
        }
    }

    private void handleReconnect(String sessionId, JsonNode payloadNode) {
        if (payloadNode == null || !payloadNode.has("roomId") || !payloadNode.has("guestToken")) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_PAYLOAD,
                    "Missing roomId or guestToken in RECONNECT payload");
            return;
        }

        String roomId = payloadNode.get("roomId").asText();
        String guestToken = payloadNode.get("guestToken").asText();
        long lastKnownTick = payloadNode.has("lastKnownServerTick") ? payloadNode.get("lastKnownServerTick").asLong() : 0;

        GuestSession session = guestSessionManager.getSession(guestToken).orElse(null);
        if (session == null) {
            connectionManager.sendError(sessionId, ErrorCode.INVALID_RECONNECT_TOKEN, "Guest session not found");
            return;
        }

        connectionManager.bindGuestToken(sessionId, guestToken);
        roomManager.handleReconnect(roomId, guestToken, sessionId, lastKnownTick);
    }

    private GuestSession getAuthenticatedSession(String sessionId) {
        Optional<PlayerConnection> conn = connectionManager.getConnection(sessionId);
        if (conn.isEmpty() || conn.get().getGuestToken() == null) {
            return null;
        }
        return guestSessionManager.getSession(conn.get().getGuestToken()).orElse(null);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        String sessionId = session.getId();
        log.error("Transport error on WebSocket session {}: {}", sessionId, exception.getMessage());
        if (!session.isOpen()) {
            Optional<PlayerConnection> removed = connectionManager.remove(sessionId);
            String guestToken = removed.map(PlayerConnection::getGuestToken).orElse(null);
            roomManager.handleDisconnect(sessionId, guestToken);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();
        Optional<PlayerConnection> removed = connectionManager.remove(sessionId);
        String guestToken = removed.map(PlayerConnection::getGuestToken).orElse(null);
        roomManager.handleDisconnect(sessionId, guestToken);
        log.info("WebSocket connection closed: sessionId={}, guestToken={}, status={}", sessionId, guestToken, status);
    }
}
