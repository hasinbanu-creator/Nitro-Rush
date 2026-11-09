package com.nitrorush.backend.protocol.payload;

public class CountdownStartedPayload {

    private int durationSeconds;

    public CountdownStartedPayload() {
        this(3);
    }

    public CountdownStartedPayload(int durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public int getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(int durationSeconds) { this.durationSeconds = durationSeconds; }
}

