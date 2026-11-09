package com.nitrorush.backend.protocol.payload;

public class JoinMatchmakingPayload {

    private String guestToken;
    private String preferredTrackId;
    private String preferredCarId;
    private String roomId;

    public JoinMatchmakingPayload() {}

    public JoinMatchmakingPayload(String guestToken, String preferredTrackId, String preferredCarId) {
        this(guestToken, preferredTrackId, preferredCarId, null);
    }

    public JoinMatchmakingPayload(String guestToken, String preferredTrackId, String preferredCarId, String roomId) {
        this.guestToken = guestToken;
        this.preferredTrackId = preferredTrackId;
        this.preferredCarId = preferredCarId;
        this.roomId = roomId;
    }

    public String getGuestToken() { return guestToken; }
    public void setGuestToken(String guestToken) { this.guestToken = guestToken; }

    public String getPreferredTrackId() { return preferredTrackId; }
    public void setPreferredTrackId(String preferredTrackId) { this.preferredTrackId = preferredTrackId; }

    public String getPreferredCarId() { return preferredCarId; }
    public void setPreferredCarId(String preferredCarId) { this.preferredCarId = preferredCarId; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
}

