package com.nitrorush.backend.protocol.payload;

/**
 * Payload sent by server to notify queued clients of their matchmaking progress,
 * collection window countdown, and final match status.
 */
public class MatchmakingStatusPayload {

    private String status;
    private int position;
    private int totalWaiting;
    private int collectionTimeRemainingSec;
    private int minPlayers;
    private int maxPlayers;

    public MatchmakingStatusPayload() {}

    public MatchmakingStatusPayload(String status, int position, int totalWaiting,
                                    int collectionTimeRemainingSec, int minPlayers, int maxPlayers) {
        this.status = status;
        this.position = position;
        this.totalWaiting = totalWaiting;
        this.collectionTimeRemainingSec = collectionTimeRemainingSec;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
    }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }

    public int getTotalWaiting() { return totalWaiting; }
    public void setTotalWaiting(int totalWaiting) { this.totalWaiting = totalWaiting; }

    public int getCollectionTimeRemainingSec() { return collectionTimeRemainingSec; }
    public void setCollectionTimeRemainingSec(int collectionTimeRemainingSec) { this.collectionTimeRemainingSec = collectionTimeRemainingSec; }

    public int getMinPlayers() { return minPlayers; }
    public void setMinPlayers(int minPlayers) { this.minPlayers = minPlayers; }

    public int getMaxPlayers() { return maxPlayers; }
    public void setMaxPlayers(int maxPlayers) { this.maxPlayers = maxPlayers; }
}

