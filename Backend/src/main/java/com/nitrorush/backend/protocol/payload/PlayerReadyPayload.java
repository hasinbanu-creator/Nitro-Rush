package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PlayerReadyPayload {

    private String roomId;

    @JsonProperty("isReady")
    private boolean ready;

    public PlayerReadyPayload() {}

    public PlayerReadyPayload(String roomId, boolean ready) {
        this.roomId = roomId;
        this.ready = ready;
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    @JsonProperty("isReady")
    public boolean isReady() { return ready; }

    @JsonProperty("isReady")
    public void setReady(boolean ready) { this.ready = ready; }
}

