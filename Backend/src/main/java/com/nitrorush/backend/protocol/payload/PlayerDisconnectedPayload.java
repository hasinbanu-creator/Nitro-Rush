package com.nitrorush.backend.protocol.payload;

public class PlayerDisconnectedPayload {

    private String playerId;
    private int graceTimeRemainingSec;

    public PlayerDisconnectedPayload() {}

    public PlayerDisconnectedPayload(String playerId, int graceTimeRemainingSec) {
        this.playerId = playerId;
        this.graceTimeRemainingSec = graceTimeRemainingSec;
    }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public int getGraceTimeRemainingSec() { return graceTimeRemainingSec; }
    public void setGraceTimeRemainingSec(int graceTimeRemainingSec) { this.graceTimeRemainingSec = graceTimeRemainingSec; }
}

