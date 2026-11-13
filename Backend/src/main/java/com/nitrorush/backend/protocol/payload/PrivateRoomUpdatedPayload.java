package com.nitrorush.backend.protocol.payload;

import java.util.ArrayList;
import java.util.List;

public class PrivateRoomUpdatedPayload {

    private String roomCode;
    private String roomId;
    private String hostPlayerId;
    private List<PlayerSlotInfo> players = new ArrayList<>();
    private boolean allReady;
    private int readyCount;
    private int totalPlayers;

    public PrivateRoomUpdatedPayload() {}

    public PrivateRoomUpdatedPayload(String roomCode, String roomId, String hostPlayerId,
                                    List<PlayerSlotInfo> players, boolean allReady,
                                    int readyCount, int totalPlayers) {
        this.roomCode = roomCode;
        this.roomId = roomId;
        this.hostPlayerId = hostPlayerId;
        this.players = players != null ? players : new ArrayList<>();
        this.allReady = allReady;
        this.readyCount = readyCount;
        this.totalPlayers = totalPlayers;
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getHostPlayerId() { return hostPlayerId; }
    public void setHostPlayerId(String hostPlayerId) { this.hostPlayerId = hostPlayerId; }

    public List<PlayerSlotInfo> getPlayers() { return players; }
    public void setPlayers(List<PlayerSlotInfo> players) { this.players = players; }

    public boolean isAllReady() { return allReady; }
    public void setAllReady(boolean allReady) { this.allReady = allReady; }

    public int getReadyCount() { return readyCount; }
    public void setReadyCount(int readyCount) { this.readyCount = readyCount; }

    public int getTotalPlayers() { return totalPlayers; }
    public void setTotalPlayers(int totalPlayers) { this.totalPlayers = totalPlayers; }
}

