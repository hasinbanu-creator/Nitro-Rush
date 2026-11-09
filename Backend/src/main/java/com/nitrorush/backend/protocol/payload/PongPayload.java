package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Positive;

public class PongPayload {

    @Positive
    @JsonProperty("clientTimestamp")
    private long clientTimestamp;

    @Positive
    @JsonProperty("serverTimestamp")
    private long serverTimestamp;

    public PongPayload() {
    }

    public PongPayload(long clientTimestamp, long serverTimestamp) {
        this.clientTimestamp = clientTimestamp;
        this.serverTimestamp = serverTimestamp;
    }

    public long getClientTimestamp() {
        return clientTimestamp;
    }

    public void setClientTimestamp(long clientTimestamp) {
        this.clientTimestamp = clientTimestamp;
    }

    public long getServerTimestamp() {
        return serverTimestamp;
    }

    public void setServerTimestamp(long serverTimestamp) {
        this.serverTimestamp = serverTimestamp;
    }
}

