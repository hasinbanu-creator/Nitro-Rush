package com.nitrorush.backend.race;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Server-authoritative race progression and timing state for an individual competitor.
 */
public class CompetitorProgress {

    private final String playerId;
    private final String displayName;
    private final String slotId;
    private final String carId;

    // Progression
    private int currentLap = 1;
    private int nextCheckpointIndex = 0;
    private boolean hasCrossedStartLine = false;
    private final Set<Integer> checkpointsClearedInLap = new HashSet<>();

    // Timings in milliseconds
    private long currentLapTimeMs = 0;
    private long previousLapTimeMs = 0;
    private long bestLapTimeMs = 0;
    private long totalRaceTimeMs = 0;
    private final List<Long> lapTimesMs = new ArrayList<>();

    // Finish & Standings
    private boolean finished = false;
    private int finishPosition = 0;
    private long finishTimeMs = 0;
    private String status = "RACING"; // RACING, FINISHED, DNF, DISCONNECTED

    // Live continuous progress scoring
    private double progressScore = 0.0;
    private double distanceToNextCp = 0.0;

    public CompetitorProgress(String playerId, String displayName, String slotId, String carId) {
        this.playerId = playerId;
        this.displayName = displayName;
        this.slotId = slotId;
        this.carId = carId;
    }

    public String getPlayerId() { return playerId; }
    public String getDisplayName() { return displayName; }
    public String getSlotId() { return slotId; }
    public String getCarId() { return carId; }

    public int getCurrentLap() { return currentLap; }
    public void setCurrentLap(int currentLap) { this.currentLap = currentLap; }

    public int getNextCheckpointIndex() { return nextCheckpointIndex; }
    public void setNextCheckpointIndex(int nextCheckpointIndex) { this.nextCheckpointIndex = nextCheckpointIndex; }

    public boolean isHasCrossedStartLine() { return hasCrossedStartLine; }
    public void setHasCrossedStartLine(boolean hasCrossedStartLine) { this.hasCrossedStartLine = hasCrossedStartLine; }

    public Set<Integer> getCheckpointsClearedInLap() { return checkpointsClearedInLap; }

    public long getCurrentLapTimeMs() { return currentLapTimeMs; }
    public void setCurrentLapTimeMs(long currentLapTimeMs) { this.currentLapTimeMs = currentLapTimeMs; }

    public long getPreviousLapTimeMs() { return previousLapTimeMs; }
    public void setPreviousLapTimeMs(long previousLapTimeMs) { this.previousLapTimeMs = previousLapTimeMs; }

    public long getBestLapTimeMs() { return bestLapTimeMs; }
    public void setBestLapTimeMs(long bestLapTimeMs) { this.bestLapTimeMs = bestLapTimeMs; }

    public long getTotalRaceTimeMs() { return totalRaceTimeMs; }
    public void setTotalRaceTimeMs(long totalRaceTimeMs) { this.totalRaceTimeMs = totalRaceTimeMs; }

    public List<Long> getLapTimesMs() { return lapTimesMs; }

    public boolean isFinished() { return finished; }
    public void setFinished(boolean finished) { this.finished = finished; }

    public int getFinishPosition() { return finishPosition; }
    public void setFinishPosition(int finishPosition) { this.finishPosition = finishPosition; }

    public long getFinishTimeMs() { return finishTimeMs; }
    public void setFinishTimeMs(long finishTimeMs) { this.finishTimeMs = finishTimeMs; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public double getProgressScore() { return progressScore; }
    public void setProgressScore(double progressScore) { this.progressScore = progressScore; }

    public double getDistanceToNextCp() { return distanceToNextCp; }
    public void setDistanceToNextCp(double distanceToNextCp) { this.distanceToNextCp = distanceToNextCp; }
}

