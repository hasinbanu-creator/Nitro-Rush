package com.nitrorush.backend.room;

import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.websocket.ConnectionManager;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * Production implementation of MessageBroadcaster routing envelopes through ConnectionManager.
 */
@Component
public class WebSocketMessageBroadcaster implements MessageBroadcaster {

    private final ConnectionManager connectionManager;

    public WebSocketMessageBroadcaster(@Lazy ConnectionManager connectionManager) {
        this.connectionManager = connectionManager;
    }

    @Override
    public void sendToSession(String sessionId, MessageEnvelope<?> message) {
        if (sessionId != null && message != null) {
            connectionManager.send(sessionId, message);
        }
    }

    @Override
    public void broadcast(String roomId, MessageEnvelope<?> message) {
        // Individual rooms broadcast by sending directly to their active participant session IDs
    }
}

