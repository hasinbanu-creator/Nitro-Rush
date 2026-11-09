package com.nitrorush.backend.protocol.payload;

public class PlayerReconnectedPayload {

    private String playerId;

    public PlayerReconnectedPayload() {}

    public PlayerReconnectedPayload(String playerId) {
        this.playerId = playerId;
    }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }
}

