package com.nitrorush.backend.protocol.payload;

public class JoinPrivateRoomPayload {

    private String roomCode;
    private String preferredCarId;

    public JoinPrivateRoomPayload() {}

    public JoinPrivateRoomPayload(String roomCode, String preferredCarId) {
        this.roomCode = roomCode;
        this.preferredCarId = preferredCarId;
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public String getPreferredCarId() { return preferredCarId; }
    public void setPreferredCarId(String preferredCarId) { this.preferredCarId = preferredCarId; }
}

