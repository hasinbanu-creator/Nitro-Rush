package com.nitrorush.backend.protocol.payload;

import java.util.ArrayList;
import java.util.List;

public class RaceFinishedPayload {

    private String playerId;
    private int finishPosition;
    private long totalTimeMs;
    private long bestLapMs;
    private List<Long> lapTimesMs = new ArrayList<>();

    public RaceFinishedPayload() {}

    public RaceFinishedPayload(String playerId, int finishPosition, long totalTimeMs, long bestLapMs, List<Long> lapTimesMs) {
        this.playerId = playerId;
        this.finishPosition = finishPosition;
        this.totalTimeMs = totalTimeMs;
        this.bestLapMs = bestLapMs;
        this.lapTimesMs = lapTimesMs != null ? lapTimesMs : new ArrayList<>();
    }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public int getFinishPosition() { return finishPosition; }
    public void setFinishPosition(int finishPosition) { this.finishPosition = finishPosition; }

    public long getTotalTimeMs() { return totalTimeMs; }
    public void setTotalTimeMs(long totalTimeMs) { this.totalTimeMs = totalTimeMs; }

    public long getBestLapMs() { return bestLapMs; }
    public void setBestLapMs(long bestLapMs) { this.bestLapMs = bestLapMs; }

    public List<Long> getLapTimesMs() { return lapTimesMs; }
    public void setLapTimesMs(List<Long> lapTimesMs) { this.lapTimesMs = lapTimesMs; }
}

