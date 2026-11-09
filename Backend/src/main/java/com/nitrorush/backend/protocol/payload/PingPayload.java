package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Positive;

public class PingPayload {

    @Positive
    @JsonProperty("clientTimestamp")
    private long clientTimestamp;

    public PingPayload() {
    }

    public PingPayload(long clientTimestamp) {
        this.clientTimestamp = clientTimestamp;
    }

    public long getClientTimestamp() {
        return clientTimestamp;
    }

    public void setClientTimestamp(long clientTimestamp) {
        this.clientTimestamp = clientTimestamp;
    }
}

