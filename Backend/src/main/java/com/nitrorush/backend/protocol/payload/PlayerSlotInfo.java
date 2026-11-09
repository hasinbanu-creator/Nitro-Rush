package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PlayerSlotInfo {

    private String id;
    private String name;
    private String carId;
    private String slot;

    @JsonProperty("isReady")
    private boolean ready;

    public PlayerSlotInfo() {}

    public PlayerSlotInfo(String id, String name, String carId, String slot, boolean ready) {
        this.id = id;
        this.name = name;
        this.carId = carId;
        this.slot = slot;
        this.ready = ready;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCarId() { return carId; }
    public void setCarId(String carId) { this.carId = carId; }

    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }

    @JsonProperty("isReady")
    public boolean isReady() { return ready; }

    @JsonProperty("isReady")
    public void setReady(boolean ready) { this.ready = ready; }
}

