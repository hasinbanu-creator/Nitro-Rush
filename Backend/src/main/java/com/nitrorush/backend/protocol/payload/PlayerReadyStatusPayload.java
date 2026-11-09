package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PlayerReadyStatusPayload {

    private String playerId;

    @JsonProperty("isReady")
    private boolean ready;

    private String carId;

    public PlayerReadyStatusPayload() {}

    public PlayerReadyStatusPayload(String playerId, boolean ready, String carId) {
        this.playerId = playerId;
        this.ready = ready;
        this.carId = carId;
    }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    @JsonProperty("isReady")
    public boolean isReady() { return ready; }

    @JsonProperty("isReady")
    public void setReady(boolean ready) { this.ready = ready; }

    public String getCarId() { return carId; }
    public void setCarId(String carId) { this.carId = carId; }
}

