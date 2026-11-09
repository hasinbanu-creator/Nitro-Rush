package com.nitrorush.backend.protocol.payload;

import java.util.ArrayList;
import java.util.List;

public class RoomAssignedPayload {

    private String roomId;
    private String trackId;
    private String slotId;
    private int maxLaps;
    private List<PlayerSlotInfo> players = new ArrayList<>();

    public RoomAssignedPayload() {}

    public RoomAssignedPayload(String roomId, String trackId, String slotId, int maxLaps, List<PlayerSlotInfo> players) {
        this.roomId = roomId;
        this.trackId = trackId;
        this.slotId = slotId;
        this.maxLaps = maxLaps;
        this.players = players != null ? players : new ArrayList<>();
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getTrackId() { return trackId; }
    public void setTrackId(String trackId) { this.trackId = trackId; }

    public String getSlotId() { return slotId; }
    public void setSlotId(String slotId) { this.slotId = slotId; }

    public int getMaxLaps() { return maxLaps; }
    public void setMaxLaps(int maxLaps) { this.maxLaps = maxLaps; }

    public List<PlayerSlotInfo> getPlayers() { return players; }
    public void setPlayers(List<PlayerSlotInfo> players) { this.players = players; }
}

