package com.nitrorush.backend.protocol.payload;

public class PlayerLeftPayload {

    private String playerId;
    private String slot;

    public PlayerLeftPayload() {}

    public PlayerLeftPayload(String playerId, String slot) {
        this.playerId = playerId;
        this.slot = slot;
    }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }
}

