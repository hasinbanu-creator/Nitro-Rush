package com.nitrorush.backend.player;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * JPA entity mapping to the 'guest_credentials' table.
 * Stores cryptographically secure SHA-256 token hashes representing guest bearer credentials.
 */
@Entity
@Table(name = "guest_credentials")
public class GuestCredential {

    @Id
    @Column(name = "credential_id", nullable = false, updatable = false)
    private UUID credentialId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false, updatable = false)
    private Player player;

    @Column(name = "token_hash", nullable = false, length = 64, unique = true, updatable = false)
    private String tokenHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "last_used_at", nullable = false)
    private OffsetDateTime lastUsedAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    public GuestCredential() {
    }

    public GuestCredential(UUID credentialId, Player player, String tokenHash, OffsetDateTime createdAt) {
        this.credentialId = credentialId;
        this.player = player;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt != null ? createdAt : OffsetDateTime.now();
        this.lastUsedAt = this.createdAt;
    }

    @PrePersist
    protected void onCreate() {
        if (this.credentialId == null) {
            this.credentialId = UUID.randomUUID();
        }
        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }
        if (this.lastUsedAt == null) {
            this.lastUsedAt = this.createdAt;
        }
    }

    public UUID getCredentialId() {
        return credentialId;
    }

    public Player getPlayer() {
        return player;
    }

    public void setPlayer(Player player) {
        this.player = player;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(OffsetDateTime lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public OffsetDateTime getRevokedAt() {
        return revokedAt;
    }

    public void setRevokedAt(OffsetDateTime revokedAt) {
        this.revokedAt = revokedAt;
    }

    public boolean isValid(OffsetDateTime now) {
        if (revokedAt != null) {
            return false;
        }
        if (expiresAt != null && !expiresAt.isAfter(now)) {
            return false;
        }
        return true;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GuestCredential that)) return false;
        return credentialId != null && Objects.equals(credentialId, that.credentialId);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "GuestCredential{" +
                "credentialId=" + credentialId +
                ", playerId=" + (player != null ? player.getPlayerId() : null) +
                ", createdAt=" + createdAt +
                ", lastUsedAt=" + lastUsedAt +
                ", expiresAt=" + expiresAt +
                ", revokedAt=" + revokedAt +
                '}';
    }
}

