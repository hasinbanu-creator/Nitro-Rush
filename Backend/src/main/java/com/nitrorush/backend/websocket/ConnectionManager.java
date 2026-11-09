package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.payload.ErrorPayload;
import com.nitrorush.backend.session.GuestSessionManager;
import com.nitrorush.backend.session.PlayerConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Thread-safe manager for active WebSocket connections and their associated sessions.
 */
@Component
public class ConnectionManager {

    private static final Logger log = LoggerFactory.getLogger(ConnectionManager.class);

    private static final int SEND_TIME_LIMIT_MS = 10000;
    private static final int BUFFER_SIZE_LIMIT_BYTES = 64 * 1024; // 64 KB send buffer limit

    private final ObjectMapper objectMapper;
    private final ConcurrentMap<String, PlayerConnection> activeConnections = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> guestTokenToSessionId = new ConcurrentHashMap<>();

    public ConnectionManager(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Registers a new incoming WebSocket connection.
     * Wraps session in ConcurrentWebSocketSessionDecorator to guarantee thread-safe non-blocking writes.
     */
    public PlayerConnection register(WebSocketSession rawSession) {
        String sessionId = rawSession.getId();
        WebSocketSession safeSession = new ConcurrentWebSocketSessionDecorator(
                rawSession, SEND_TIME_LIMIT_MS, BUFFER_SIZE_LIMIT_BYTES);

        PlayerConnection connection = new PlayerConnection(safeSession);
        PlayerConnection existing = activeConnections.putIfAbsent(sessionId, connection);

        if (existing != null) {
            log.warn("Duplicate connection registration attempt for sessionId={}", sessionId);
            return existing;
        }

        log.info("Registered WebSocket connection: sessionId={}, remote={}", sessionId, rawSession.getRemoteAddress());
        return connection;
    }

    /**
     * Unregisters a disconnected session and clears associated mappings.
     */
    public Optional<PlayerConnection> remove(String sessionId) {
        if (sessionId == null) return Optional.empty();

        PlayerConnection removed = activeConnections.remove(sessionId);
        if (removed != null) {
            String guestToken = removed.getGuestToken();
            if (guestToken != null) {
                guestTokenToSessionId.remove(guestToken, sessionId);
            }
            log.info("Unregistered WebSocket connection: sessionId={}, guestToken={}",
                    sessionId, guestToken != null ? GuestSessionManager.maskToken(guestToken) : "unbound");
            return Optional.of(removed);
        }
        return Optional.empty();
    }

    /**
     * Associates an authenticated guest token with an active WebSocket session.
     */
    public boolean bindGuestToken(String sessionId, String guestToken) {
        PlayerConnection connection = activeConnections.get(sessionId);
        if (connection == null) {
            log.warn("Cannot bind guest token: session {} does not exist", sessionId);
            return false;
        }

        String oldSessionId = guestTokenToSessionId.put(guestToken, sessionId);
        if (oldSessionId != null && !oldSessionId.equals(sessionId)) {
            log.info("Replaced previous session {} for guestToken={}", oldSessionId, GuestSessionManager.maskToken(guestToken));
        }

        connection.setGuestToken(guestToken);
        connection.touch();
        log.debug("Bound guestToken={} to sessionId={}", GuestSessionManager.maskToken(guestToken), sessionId);
        return true;
    }

    /**
     * Sends a typed JSON protocol envelope to a specific connection.
     */
    public boolean send(String sessionId, MessageEnvelope<?> message) {
        PlayerConnection connection = activeConnections.get(sessionId);
        if (connection == null || !connection.isOpen()) {
            log.warn("Cannot send message: sessionId={} is not active or closed", sessionId);
            return false;
        }

        try {
            String json = objectMapper.writeValueAsString(message);
            connection.getSession().sendMessage(new TextMessage(json));
            connection.touch();
            return true;
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize message of type {} for session {}: {}", message.getType(), sessionId, e.getMessage());
            return false;
        } catch (IOException e) {
            log.error("Failed to send WebSocket text message to session {}: {}", sessionId, e.getMessage());
            return false;
        }
    }

    /**
     * Sends a standard documented ERROR envelope to a specific connection.
     */
    public boolean sendError(String sessionId, ErrorCode errorCode, String message) {
        MessageEnvelope<ErrorPayload> envelope = MessageEnvelope.error(errorCode, message);
        return send(sessionId, envelope);
    }

    /**
     * Retrieves an active connection by session ID.
     */
    public Optional<PlayerConnection> getConnection(String sessionId) {
        if (sessionId == null) return Optional.empty();
        return Optional.ofNullable(activeConnections.get(sessionId));
    }

    /**
     * Retrieves an active connection by authenticated guest token.
     */
    public Optional<PlayerConnection> getConnectionByGuestToken(String guestToken) {
        if (guestToken == null) return Optional.empty();
        String sessionId = guestTokenToSessionId.get(guestToken);
        if (sessionId == null) return Optional.empty();
        return getConnection(sessionId);
    }

    public void updateActivity(String sessionId) {
        PlayerConnection conn = activeConnections.get(sessionId);
        if (conn != null) {
            conn.touch();
        }
    }

    public int getConnectionCount() {
        return activeConnections.size();
    }

    public void clearAll() {
        activeConnections.clear();
        guestTokenToSessionId.clear();
    }
}

