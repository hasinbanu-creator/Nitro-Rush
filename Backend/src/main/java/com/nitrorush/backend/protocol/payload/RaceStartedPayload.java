package com.nitrorush.backend.protocol.payload;

public class RaceStartedPayload {

    private long serverTimestamp;

    public RaceStartedPayload() {}

    public RaceStartedPayload(long serverTimestamp) {
        this.serverTimestamp = serverTimestamp;
    }

    public long getServerTimestamp() { return serverTimestamp; }
    public void setServerTimestamp(long serverTimestamp) { this.serverTimestamp = serverTimestamp; }
}

