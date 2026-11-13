package com.nitrorush.backend.protocol.payload;

public class CreatePrivateRoomPayload {

    private String preferredTrackId;
    private String preferredCarId;

    public CreatePrivateRoomPayload() {}

    public CreatePrivateRoomPayload(String preferredTrackId, String preferredCarId) {
        this.preferredTrackId = preferredTrackId;
        this.preferredCarId = preferredCarId;
    }

    public String getPreferredTrackId() { return preferredTrackId; }
    public void setPreferredTrackId(String preferredTrackId) { this.preferredTrackId = preferredTrackId; }

    public String getPreferredCarId() { return preferredCarId; }
    public void setPreferredCarId(String preferredCarId) { this.preferredCarId = preferredCarId; }
}

