package com.nitrorush.backend.session;

import org.springframework.web.socket.WebSocketSession;

import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.Objects;

/**
 * Tracks an active physical WebSocket connection and its bound guest identity.
 */
public class PlayerConnection {

    private final String sessionId;
    private final WebSocketSession session;
    private final InetSocketAddress remoteAddress;
    private final Instant connectedAt;
    private volatile Instant lastActivityAt;
    private volatile String guestToken;

    public PlayerConnection(WebSocketSession session) {
        this.session = Objects.requireNonNull(session, "session cannot be null");
        this.sessionId = session.getId();
        this.remoteAddress = session.getRemoteAddress();
        this.connectedAt = Instant.now();
        this.lastActivityAt = this.connectedAt;
    }

    public String getSessionId() {
        return sessionId;
    }

    public WebSocketSession getSession() {
        return session;
    }

    public InetSocketAddress getRemoteAddress() {
        return remoteAddress;
    }

    public Instant getConnectedAt() {
        return connectedAt;
    }

    public Instant getLastActivityAt() {
        return lastActivityAt;
    }

    public void touch() {
        this.lastActivityAt = Instant.now();
    }

    public String getGuestToken() {
        return guestToken;
    }

    public void setGuestToken(String guestToken) {
        this.guestToken = guestToken;
    }

    public boolean isOpen() {
        return session.isOpen();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PlayerConnection that)) return false;
        return Objects.equals(sessionId, that.sessionId);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(sessionId);
    }

    @Override
    public String toString() {
        return "PlayerConnection{" +
                "sessionId='" + sessionId + '\'' +
                ", remoteAddress=" + remoteAddress +
                ", guestToken=" + (guestToken != null ? GuestSessionManager.maskToken(guestToken) : "unbound") +
                ", connectedAt=" + connectedAt +
                ", lastActivityAt=" + lastActivityAt +
                '}';
    }
}

