package com.nitrorush.backend.player;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * JPA entity representing a player in the Nitro Rush game,
 * mapping directly to the PostgreSQL 'players' table.
 */
@Entity
@Table(name = "players")
public class Player {

    /**
     * Account classification for Nitro Rush players:
     * - GUEST: Temporary or guest racer session.
     * - REGISTERED: Fully authenticated account with persistent credentials.
     */
    public enum AccountType {
        GUEST,
        REGISTERED
    }

    @Id
    @Column(name = "player_id", nullable = false, updatable = false)
    private UUID playerId;

    @Column(name = "username", nullable = false, length = 16)
    private String username;

    @Column(name = "avatar_id", length = 50)
    private String avatarId;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false, length = 20)
    private AccountType accountType = AccountType.GUEST;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /**
     * Default no-argument constructor required by JPA.
     */
    public Player() {
    }

    /**
     * Full parameterized constructor.
     *
     * @param playerId    Unique player identifier
     * @param username    Display username (max 16 characters)
     * @param avatarId    Selected avatar or vehicle identifier (optional)
     * @param accountType Account type (GUEST or REGISTERED)
     * @param createdAt   Timestamp of account creation
     */
    public Player(UUID playerId, String username, String avatarId, AccountType accountType, OffsetDateTime createdAt) {
        this.playerId = playerId;
        this.username = username;
        this.avatarId = avatarId;
        this.accountType = accountType != null ? accountType : AccountType.GUEST;
        this.createdAt = createdAt != null ? createdAt : OffsetDateTime.now();
    }

    /**
     * Convenience constructor for new player creation.
     *
     * @param playerId    Unique player identifier
     * @param username    Display username (max 16 characters)
     * @param avatarId    Selected avatar identifier (optional)
     * @param accountType Account type (GUEST or REGISTERED)
     */
    public Player(UUID playerId, String username, String avatarId, AccountType accountType) {
        this(playerId, username, avatarId, accountType, OffsetDateTime.now());
    }

    /**
     * Convenience constructor for quick player instantiation with auto-generated UUID.
     *
     * @param username Display username
     * @param avatarId Selected avatar identifier
     */
    public Player(String username, String avatarId) {
        this(UUID.randomUUID(), username, avatarId, AccountType.GUEST, OffsetDateTime.now());
    }

    @PrePersist
    protected void onCreate() {
        if (this.playerId == null) {
            this.playerId = UUID.randomUUID();
        }
        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }
        if (this.accountType == null) {
            this.accountType = AccountType.GUEST;
        }
    }

    // Getters and Setters

    public UUID getPlayerId() {
        return playerId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getAvatarId() {
        return avatarId;
    }

    public void setAvatarId(String avatarId) {
        this.avatarId = avatarId;
    }

    public AccountType getAccountType() {
        return accountType;
    }

    public void setAccountType(AccountType accountType) {
        this.accountType = accountType;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Player that)) return false;
        return playerId != null && Objects.equals(playerId, that.playerId);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "Player{" +
                "playerId=" + playerId +
                ", username='" + username + '\'' +
                ", avatarId='" + avatarId + '\'' +
                ", accountType=" + accountType +
                ", createdAt=" + createdAt +
                '}';
    }
}

