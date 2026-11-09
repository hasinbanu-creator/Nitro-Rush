package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AuthenticateGuestPayload {

    @JsonProperty("guestToken")
    private String guestToken;

    @NotBlank
    @Size(min = 2, max = 16)
    @JsonProperty("displayName")
    private String displayName;

    @JsonProperty("avatarId")
    private String avatarId;

    public AuthenticateGuestPayload() {
    }

    public AuthenticateGuestPayload(String guestToken, String displayName, String avatarId) {
        this.guestToken = guestToken;
        this.displayName = displayName;
        this.avatarId = avatarId;
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

    public String getAvatarId() {
        return avatarId;
    }

    public void setAvatarId(String avatarId) {
        this.avatarId = avatarId;
    }
}

