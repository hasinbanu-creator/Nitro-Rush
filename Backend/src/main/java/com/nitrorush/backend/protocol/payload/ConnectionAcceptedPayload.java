package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public class ConnectionAcceptedPayload {

    @NotBlank
    @JsonProperty("sessionId")
    private String sessionId;

    @Positive
    @JsonProperty("heartbeatIntervalMs")
    private long heartbeatIntervalMs;

    public ConnectionAcceptedPayload() {
    }

    public ConnectionAcceptedPayload(String sessionId, long heartbeatIntervalMs) {
        this.sessionId = sessionId;
        this.heartbeatIntervalMs = heartbeatIntervalMs;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public long getHeartbeatIntervalMs() {
        return heartbeatIntervalMs;
    }

    public void setHeartbeatIntervalMs(long heartbeatIntervalMs) {
        this.heartbeatIntervalMs = heartbeatIntervalMs;
    }
}

