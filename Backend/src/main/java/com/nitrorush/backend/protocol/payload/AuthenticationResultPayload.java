package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public class AuthenticationResultPayload {

    @JsonProperty("success")
    private boolean success;

    @NotBlank
    @JsonProperty("guestToken")
    private String guestToken;

    @NotBlank
    @JsonProperty("displayName")
    private String displayName;

    @JsonProperty("playerId")
    private UUID playerId;

    public AuthenticationResultPayload() {
    }

    public AuthenticationResultPayload(boolean success, String guestToken, String displayName, UUID playerId) {
        this.success = success;
        this.guestToken = guestToken;
        this.displayName = displayName;
        this.playerId = playerId;
    }

    public AuthenticationResultPayload(boolean success, String guestToken, String displayName) {
        this(success, guestToken, displayName, null);
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getGuestToken() {
        return guestToken;
    }

    public void setGuestToken(String guestToken) {
        this.guestToken = guestToken;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public UUID getPlayerId() {
        return playerId;
    }

    public void setPlayerId(UUID playerId) {
        this.playerId = playerId;
    }
}
