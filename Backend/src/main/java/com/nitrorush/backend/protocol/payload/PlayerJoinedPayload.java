package com.nitrorush.backend.protocol.payload;

public class PlayerJoinedPayload {

    private PlayerSlotInfo player;

    public PlayerJoinedPayload() {}

    public PlayerJoinedPayload(PlayerSlotInfo player) {
        this.player = player;
    }

    public PlayerSlotInfo getPlayer() { return player; }
    public void setPlayer(PlayerSlotInfo player) { this.player = player; }
}

