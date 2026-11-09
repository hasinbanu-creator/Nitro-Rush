package com.nitrorush.backend.room;

import com.nitrorush.backend.protocol.MessageEnvelope;

/**
 * Interface abstraction for dispatching protocol messages to sessions or rooms.
 */
public interface MessageBroadcaster {

    /**
     * Sends message envelope directly to a specific WebSocket session.
     */
    void sendToSession(String sessionId, MessageEnvelope<?> message);

    /**
     * Broadcasts message envelope to all active sessions in the room.
     */
    void broadcast(String roomId, MessageEnvelope<?> message);
}

