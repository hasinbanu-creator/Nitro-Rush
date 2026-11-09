package com.nitrorush.backend.protocol.payload;

public class CompetitorResultItem {

    private int position;
    private String playerId;
    private String displayName;
    private String carId;
    private long totalTimeMs;
    private long bestLapMs;
    private String status;

    public CompetitorResultItem() {}

    public CompetitorResultItem(int position, String playerId, String displayName, String carId,
                                long totalTimeMs, long bestLapMs, String status) {
        this.position = position;
        this.playerId = playerId;
        this.displayName = displayName;
        this.carId = carId;
        this.totalTimeMs = totalTimeMs;
        this.bestLapMs = bestLapMs;
        this.status = status;
    }

    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getCarId() { return carId; }
    public void setCarId(String carId) { this.carId = carId; }

    public long getTotalTimeMs() { return totalTimeMs; }
    public void setTotalTimeMs(long totalTimeMs) { this.totalTimeMs = totalTimeMs; }

    public long getBestLapMs() { return bestLapMs; }
    public void setBestLapMs(long bestLapMs) { this.bestLapMs = bestLapMs; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}

