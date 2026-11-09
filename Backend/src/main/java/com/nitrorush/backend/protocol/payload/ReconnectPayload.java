package com.nitrorush.backend.protocol.payload;

public class ReconnectPayload {

    private String roomId;
    private String guestToken;
    private long lastKnownServerTick;

    public ReconnectPayload() {}

    public ReconnectPayload(String roomId, String guestToken, long lastKnownServerTick) {
        this.roomId = roomId;
        this.guestToken = guestToken;
        this.lastKnownServerTick = lastKnownServerTick;
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getGuestToken() { return guestToken; }
    public void setGuestToken(String guestToken) { this.guestToken = guestToken; }

    public long getLastKnownServerTick() { return lastKnownServerTick; }
    public void setLastKnownServerTick(long lastKnownServerTick) { this.lastKnownServerTick = lastKnownServerTick; }
}

