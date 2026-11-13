package com.nitrorush.backend.protocol.payload;

public class StartPrivateRacePayload {

    private String roomCode;
    private String roomId;

    public StartPrivateRacePayload() {}

    public StartPrivateRacePayload(String roomCode, String roomId) {
        this.roomCode = roomCode;
        this.roomId = roomId;
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
}

