package com.nitrorush.backend.session;

import java.time.Instant;
import java.util.Objects;

/**
 * In-memory representation of an authenticated guest user session.
 */
public class GuestSession {

    private final String guestToken;
    private volatile String displayName;
    private volatile String avatarId;
    private final Instant createdAt;
    private volatile Instant lastActiveAt;

    public GuestSession(String guestToken, String displayName, String avatarId) {
        this.guestToken = Objects.requireNonNull(guestToken, "guestToken cannot be null");
        this.displayName = Objects.requireNonNull(displayName, "displayName cannot be null");
        this.avatarId = avatarId;
        this.createdAt = Instant.now();
        this.lastActiveAt = this.createdAt;
    }

    public String getGuestToken() {
        return guestToken;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getAvatarId() {
        return avatarId;
    }

    public void setAvatarId(String avatarId) {
        this.avatarId = avatarId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastActiveAt() {
        return lastActiveAt;
    }

    public void touch() {
        this.lastActiveAt = Instant.now();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GuestSession that)) return false;
        return Objects.equals(guestToken, that.guestToken);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(guestToken);
    }

    @Override
    public String toString() {
        return "GuestSession{" +
                "guestToken='" + GuestSessionManager.maskToken(guestToken) + '\'' +
                ", displayName='" + displayName + '\'' +
                ", createdAt=" + createdAt +
                ", lastActiveAt=" + lastActiveAt +
                '}';
    }
}

