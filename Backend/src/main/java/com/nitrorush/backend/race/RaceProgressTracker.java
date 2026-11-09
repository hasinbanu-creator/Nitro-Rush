package com.nitrorush.backend.race;

import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.track.TrackCheckpoint;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.protocol.payload.CompetitorResultItem;
import com.nitrorush.backend.protocol.payload.RaceResultsPayload;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;

/**
 * Server-authoritative race progress, sequential checkpoint validation, lap progression,
 * 30-second trailing-player DNF countdown, and final race results ranking.
 */
public class RaceProgressTracker {

    public static final int DEFAULT_TOTAL_LAPS = 3;
    public static final long DNF_COUNTDOWN_DURATION_MS = 30_000L;

    private final TrackDefinition track;
    private final int totalLaps;
    private final List<TrackCheckpoint> checkpoints;
    private final Map<String, CompetitorProgress> competitors = new LinkedHashMap<>();
    private final List<CompetitorProgress> finishedCompetitors = new ArrayList<>();
    private final Map<String, double[]> previousPositions = new ConcurrentHashMap<>();

    private boolean raceStarted = false;
    private boolean raceFinished = false;
    private boolean dnfCountdownActive = false;
    private long dnfCountdownRemainingMs = 0;
    private String winnerPlayerId = null;

    private BiConsumer<CompetitorProgress, Integer> onCompetitorFinished;
    private Runnable onRaceComplete;

    public RaceProgressTracker(TrackDefinition track) {
        this(track, DEFAULT_TOTAL_LAPS);
    }

    public RaceProgressTracker(TrackDefinition track, int totalLaps) {
        this.track = Objects.requireNonNull(track, "track definition must not be null");
        this.totalLaps = totalLaps > 0 ? totalLaps : DEFAULT_TOTAL_LAPS;
        this.checkpoints = track.getCheckpoints() != null ? track.getCheckpoints() : Collections.emptyList();
    }

    public synchronized void registerCompetitor(String playerId, String displayName, String slotId, String carId) {
        if (raceStarted) {
            throw new IllegalStateException("Cannot register competitor after race started");
        }
        competitors.put(playerId, new CompetitorProgress(playerId, displayName, slotId, carId));
    }

    public synchronized void startRace() {
        raceStarted = true;
        raceFinished = false;
        dnfCountdownActive = false;
        dnfCountdownRemainingMs = 0;
        winnerPlayerId = null;
        finishedCompetitors.clear();
        previousPositions.clear();

        for (CompetitorProgress comp : competitors.values()) {
            comp.setCurrentLap(1);
            comp.setNextCheckpointIndex(0);
            comp.getCheckpointsClearedInLap().clear();
            comp.setHasCrossedStartLine(false);
            comp.setCurrentLapTimeMs(0);
            comp.setPreviousLapTimeMs(0);
            comp.setBestLapTimeMs(0);
            comp.setTotalRaceTimeMs(0);
            comp.getLapTimesMs().clear();
            comp.setFinished(false);
            comp.setFinishPosition(0);
            comp.setFinishTimeMs(0);
            comp.setStatus("RACING");
            comp.setProgressScore(0.0);
        }
    }

    /**
     * Updates race progress for all competitors for elapsed delta time (in seconds).
     *
     * @param dtSeconds Elapsed simulation timestep in seconds (typically 0.050)
     * @param currentStates Map of vehicle states by playerId
     */
    public synchronized void update(double dtSeconds, Map<String, VehicleState> currentStates) {
        if (!raceStarted || raceFinished) {
            return;
        }

        long deltaMs = Math.round(dtSeconds * 1000.0);

        // 1. Update DNF Countdown timer if leader has crossed finish line
        if (dnfCountdownActive) {
            dnfCountdownRemainingMs -= deltaMs;
            if (dnfCountdownRemainingMs <= 0) {
                dnfCountdownRemainingMs = 0;
                handleDnfTimeout();
                return;
            }
        }

        // 2. Process each competitor
        for (Map.Entry<String, CompetitorProgress> entry : competitors.entrySet()) {
            String playerId = entry.getKey();
            CompetitorProgress comp = entry.getValue();

            if (comp.isFinished()) {
                continue;
            }

            VehicleState state = currentStates != null ? currentStates.get(playerId) : null;
            if (state == null) {
                continue;
            }

            double curX = state.getX();
            double curY = state.getY();

            double[] prevPos = previousPositions.get(playerId);
            double prevX = prevPos != null ? prevPos[0] : curX;
            double prevY = prevPos != null ? prevPos[1] : curY;

            // Increment timers
            comp.setCurrentLapTimeMs(comp.getCurrentLapTimeMs() + deltaMs);
            comp.setTotalRaceTimeMs(comp.getTotalRaceTimeMs() + deltaMs);

            // Test checkpoint crossings
            testCheckpointCrossing(comp, curX, curY, prevX, prevY);

            // Update live progress score
            updateProgressScore(comp, curX, curY);

            // Store current position for next tick
            previousPositions.put(playerId, new double[]{curX, curY});
        }

        // 3. Check if all competitors finished naturally
        if (finishedCompetitors.size() == competitors.size()) {
            completeRace();
        }
    }

    private void testCheckpointCrossing(CompetitorProgress comp, double curX, double curY, double prevX, double prevY) {
        if (checkpoints.isEmpty()) return;

        // 1. Initial Race Start Line Crossing (moving forward from grid across CP 0)
        if (!comp.isHasCrossedStartLine()) {
            TrackCheckpoint cp0 = checkpoints.get(0);
            if (isCrossingGate(prevX, prevY, curX, curY, cp0, true)) {
                comp.setHasCrossedStartLine(true);
                comp.setNextCheckpointIndex(1 % checkpoints.size());
                comp.getCheckpointsClearedInLap().add(0);
                return;
            }
        }

        // 2. Sequential Checkpoint Validation
        TrackCheckpoint targetCp = checkpoints.get(comp.getNextCheckpointIndex());
        if (targetCp == null) return;

        boolean crossed = isCrossingGate(prevX, prevY, curX, curY, targetCp, true);
        if (crossed) {
            if (targetCp.getIndex() == 0 && comp.isHasCrossedStartLine()) {
                // Crossing CP 0 after all intermediate checkpoints were cleared = Lap Completed!
                int requiredOthers = checkpoints.size() - 1;
                if (comp.getCheckpointsClearedInLap().size() >= requiredOthers) {
                    completeLap(comp);
                }
            } else {
                // Intermediate checkpoint cleared in sequence
                comp.getCheckpointsClearedInLap().add(targetCp.getIndex());
                comp.setNextCheckpointIndex((comp.getNextCheckpointIndex() + 1) % checkpoints.size());
            }
        }
    }

    private void completeLap(CompetitorProgress comp) {
        long lapTime = comp.getCurrentLapTimeMs();
        comp.getLapTimesMs().add(lapTime);
        comp.setPreviousLapTimeMs(lapTime);

        if (comp.getBestLapTimeMs() == 0 || lapTime < comp.getBestLapTimeMs()) {
            comp.setBestLapTimeMs(lapTime);
        }

        if (comp.getCurrentLap() >= totalLaps) {
            // Competitor finished!
            comp.setFinished(true);
            comp.setStatus("FINISHED");
            finishedCompetitors.add(comp);
            comp.setFinishPosition(finishedCompetitors.size());
            comp.setFinishTimeMs(comp.getTotalRaceTimeMs());

            if (onCompetitorFinished != null) {
                onCompetitorFinished.accept(comp, comp.getFinishPosition());
            }

            // Winner activates 30-second DNF countdown
            if (finishedCompetitors.size() == 1) {
                winnerPlayerId = comp.getPlayerId();
                if (competitors.size() > 1) {
                    dnfCountdownActive = true;
                    dnfCountdownRemainingMs = DNF_COUNTDOWN_DURATION_MS;
                }
            }
        } else {
            // Advance to next lap
            comp.setCurrentLap(comp.getCurrentLap() + 1);
            comp.setCurrentLapTimeMs(0);
            comp.getCheckpointsClearedInLap().clear();
            comp.getCheckpointsClearedInLap().add(0);
            comp.setNextCheckpointIndex(1 % checkpoints.size());
        }
    }

    private void updateProgressScore(CompetitorProgress comp, double curX, double curY) {
        if (checkpoints.isEmpty()) return;

        TrackCheckpoint targetCp = checkpoints.get(comp.getNextCheckpointIndex());
        double distToCp = Math.hypot(targetCp.getX() - curX, targetCp.getY() - curY);
        comp.setDistanceToNextCp(distToCp);

        if (comp.isFinished()) {
            comp.setProgressScore(1_000_000.0 - (comp.getFinishPosition() * 10_000.0));
        } else {
            double lapWeight = (comp.getCurrentLap() - 1) * 20_000.0;
            double cpWeight = comp.getCheckpointsClearedInLap().size() * 1000.0;
            double proximityBonus = Math.max(0.0, 1000.0 - distToCp);
            comp.setProgressScore(lapWeight + cpWeight + proximityBonus);
        }
    }

    private void handleDnfTimeout() {
        // Flag all un-finished competitors as DNF
        List<CompetitorProgress> unfinished = new ArrayList<>();
        for (CompetitorProgress comp : competitors.values()) {
            if (!comp.isFinished()) {
                comp.setFinished(true);
                comp.setStatus("DNF");
                comp.setFinishTimeMs(comp.getTotalRaceTimeMs());
                unfinished.add(comp);
            }
        }

        // Sort DNF competitors descending by progress score
        unfinished.sort((a, b) -> Double.compare(b.getProgressScore(), a.getProgressScore()));

        int nextPos = finishedCompetitors.size() + 1;
        for (CompetitorProgress dnfComp : unfinished) {
            dnfComp.setFinishPosition(nextPos++);
            finishedCompetitors.add(dnfComp);
            if (onCompetitorFinished != null) {
                onCompetitorFinished.accept(dnfComp, dnfComp.getFinishPosition());
            }
        }

        completeRace();
    }

    private void completeRace() {
        raceFinished = true;
        dnfCountdownActive = false;
        dnfCountdownRemainingMs = 0;
        if (onRaceComplete != null) {
            onRaceComplete.run();
        }
    }

    /**
     * Line segment intersection + plane crossing fallback matching TypeScript RaceManager.
     */
    public boolean isCrossingGate(double x1, double y1, double x2, double y2, TrackCheckpoint cp, boolean requireForward) {
        double halfW = cp.getWidth() / 2.0;
        double angle = cp.getAngle();
        double cos = Math.cos(angle);
        double sin = Math.sin(angle);
        double normalX = -sin;
        double normalY = cos;

        double lateralTolerance = Math.max(36.0, Math.round(halfW * 0.52));
        double gateHalfWidth = halfW + lateralTolerance;

        double gx1 = cp.getX() - (normalX * gateHalfWidth);
        double gy1 = cp.getY() - (normalY * gateHalfWidth);
        double gx2 = cp.getX() + (normalX * gateHalfWidth);
        double gy2 = cp.getY() + (normalY * gateHalfWidth);

        boolean intersects = lineSegmentsIntersect(x1, y1, x2, y2, gx1, gy1, gx2, gy2);

        // Fallback: gate plane crossing
        boolean planeCrossed = false;
        double d1 = (x1 - cp.getX()) * cos + (y1 - cp.getY()) * sin;
        double d2 = (x2 - cp.getX()) * cos + (y2 - cp.getY()) * sin;
        if ((d1 <= 4.0 && d2 > -1.0 && d2 > d1) || (d1 < 0.0 && d2 >= 0.0)) {
            double latDist = Math.abs((x2 - cp.getX()) * normalX + (y2 - cp.getY()) * normalY);
            if (latDist <= gateHalfWidth + 6.0) {
                planeCrossed = true;
            }
        }

        if (!intersects && !planeCrossed) {
            return false;
        }

        if (requireForward) {
            double moveX = x2 - x1;
            double moveY = y2 - y1;
            double dot = moveX * cos + moveY * sin;
            return dot > 0.01;
        }

        return true;
    }

    private boolean lineSegmentsIntersect(double p0_x, double p0_y, double p1_x, double p1_y,
                                          double p2_x, double p2_y, double p3_x, double p3_y) {
        double s1_x = p1_x - p0_x;
        double s1_y = p1_y - p0_y;
        double s2_x = p3_x - p2_x;
        double s2_y = p3_y - p2_y;

        double denom = -s2_x * s1_y + s1_x * s2_y;
        if (Math.abs(denom) < 0.00001) return false;

        double s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denom;
        double t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denom;

        return s >= 0.0 && s <= 1.0 && t >= 0.0 && t <= 1.0;
    }

    /**
     * Returns dynamic leaderboard sorted 1st to Nth.
     */
    public synchronized List<CompetitorProgress> getLeaderboard() {
        List<CompetitorProgress> list = new ArrayList<>(competitors.values());
        list.sort((a, b) -> {
            if (a.isFinished() && b.isFinished()) {
                return Integer.compare(a.getFinishPosition(), b.getFinishPosition());
            }
            if (a.isFinished()) return -1;
            if (b.isFinished()) return 1;
            return Double.compare(b.getProgressScore(), a.getProgressScore());
        });
        return list;
    }

    public synchronized RaceResultsPayload generateResults() {
        List<CompetitorProgress> sorted = getLeaderboard();
        List<CompetitorResultItem> items = new ArrayList<>();
        int rank = 1;
        for (CompetitorProgress comp : sorted) {
            int pos = comp.getFinishPosition() > 0 ? comp.getFinishPosition() : rank++;
            items.add(new CompetitorResultItem(
                    pos,
                    comp.getPlayerId(),
                    comp.getDisplayName(),
                    comp.getCarId(),
                    comp.getFinishTimeMs() > 0 ? comp.getFinishTimeMs() : comp.getTotalRaceTimeMs(),
                    comp.getBestLapTimeMs(),
                    comp.getStatus()
            ));
        }
        return new RaceResultsPayload(track.getId(), items);
    }

    public synchronized CompetitorProgress getCompetitor(String playerId) {
        return competitors.get(playerId);
    }

    public synchronized boolean isRaceFinished() { return raceFinished; }
    public synchronized boolean isDnfCountdownActive() { return dnfCountdownActive; }
    public synchronized long getDnfCountdownRemainingMs() { return dnfCountdownRemainingMs; }
    public synchronized String getWinnerPlayerId() { return winnerPlayerId; }

    public void setOnCompetitorFinished(BiConsumer<CompetitorProgress, Integer> callback) {
        this.onCompetitorFinished = callback;
    }

    public void setOnRaceComplete(Runnable callback) {
        this.onRaceComplete = callback;
    }
}

