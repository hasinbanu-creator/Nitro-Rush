package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public class AuthenticationResultPayload {

    @JsonProperty("success")
    private boolean success;

    @NotBlank
    @JsonProperty("guestToken")
    private String guestToken;

    @NotBlank
    @JsonProperty("displayName")
    private String displayName;

    public AuthenticationResultPayload() {
    }

    public AuthenticationResultPayload(boolean success, String guestToken, String displayName) {
        this.success = success;
        this.guestToken = guestToken;
        this.displayName = displayName;
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
}

