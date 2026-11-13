package com.nitrorush.backend.protocol.payload;

import java.util.ArrayList;
import java.util.List;

public class PrivateRoomCreatedPayload {

    private String roomCode;
    private String roomId;
    private String trackId;
    private String slotId;
    private String hostPlayerId;
    private int maxPlayers;
    private List<PlayerSlotInfo> players = new ArrayList<>();

    public PrivateRoomCreatedPayload() {}

    public PrivateRoomCreatedPayload(String roomCode, String roomId, String trackId,
                                     String slotId, String hostPlayerId, int maxPlayers,
                                     List<PlayerSlotInfo> players) {
        this.roomCode = roomCode;
        this.roomId = roomId;
        this.trackId = trackId;
        this.slotId = slotId;
        this.hostPlayerId = hostPlayerId;
        this.maxPlayers = maxPlayers;
        this.players = players != null ? players : new ArrayList<>();
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getTrackId() { return trackId; }
    public void setTrackId(String trackId) { this.trackId = trackId; }

    public String getSlotId() { return slotId; }
    public void setSlotId(String slotId) { this.slotId = slotId; }

    public String getHostPlayerId() { return hostPlayerId; }
    public void setHostPlayerId(String hostPlayerId) { this.hostPlayerId = hostPlayerId; }

    public int getMaxPlayers() { return maxPlayers; }
    public void setMaxPlayers(int maxPlayers) { this.maxPlayers = maxPlayers; }

    public List<PlayerSlotInfo> getPlayers() { return players; }
    public void setPlayers(List<PlayerSlotInfo> players) { this.players = players; }
}

