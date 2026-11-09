package com.nitrorush.backend.protocol.payload;

public class SelectCarPayload {

    private String roomId;
    private String carId;

    public SelectCarPayload() {}

    public SelectCarPayload(String roomId, String carId) {
        this.roomId = roomId;
        this.carId = carId;
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getCarId() { return carId; }
    public void setCarId(String carId) { this.carId = carId; }
}

