package com.nitrorush.backend.protocol.payload;

public class CancelMatchmakingPayload {

    private String guestToken;
    private String roomId;

    public CancelMatchmakingPayload() {}

    public CancelMatchmakingPayload(String guestToken) {
        this.guestToken = guestToken;
    }

    public CancelMatchmakingPayload(String guestToken, String roomId) {
        this.guestToken = guestToken;
        this.roomId = roomId;
    }

    public String getGuestToken() { return guestToken; }
    public void setGuestToken(String guestToken) { this.guestToken = guestToken; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
}

