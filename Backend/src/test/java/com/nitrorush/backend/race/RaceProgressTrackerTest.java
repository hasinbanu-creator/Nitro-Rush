package com.nitrorush.backend.race;

import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.track.TrackCheckpoint;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import com.nitrorush.backend.protocol.payload.RaceResultsPayload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Milestone 8.3: Race Progress Tracker & Checkpoint Validation Tests")
public class RaceProgressTrackerTest {

    private TrackDefinition track;
    private RaceProgressTracker tracker;

    @BeforeEach
    public void setup() {
        track = TrackRegistry.getStatic("coastal-rush");
        tracker = new RaceProgressTracker(track, 3);
        tracker.registerCompetitor("p1", "Racer1", "P1", "bolt-gt");
        tracker.registerCompetitor("p2", "Racer2", "P2", "viper-r");
        tracker.startRace();
    }

    private VehicleState makeState(double x, double y, double angle) {
        return new VehicleState(x, y, angle, 100.0);
    }

    @Test
    @DisplayName("Competitors initialize at Lap 1, Checkpoint 0, not finished")
    public void testInitialProgress() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");
        assertNotNull(p1);
        assertEquals(1, p1.getCurrentLap());
        assertEquals(0, p1.getNextCheckpointIndex());
        assertFalse(p1.isHasCrossedStartLine());
        assertFalse(p1.isFinished());
        assertEquals("RACING", p1.getStatus());
    }

    @Test
    @DisplayName("Start line crossing moves car from grid across CP 0 and sets next CP to 1")
    public void testStartLineCrossing() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");
        TrackCheckpoint cp0 = track.getCheckpoints().get(0); // at x=950, y=1920, angle=0 (facing positive X)

        // Car starts behind CP 0 (e.g. x=860, y=1920)
        Map<String, VehicleState> states0 = Map.of("p1", makeState(860, 1920, 0));
        tracker.update(0.050, states0);
        assertFalse(p1.isHasCrossedStartLine());
        assertEquals(0, p1.getNextCheckpointIndex());

        // Car moves across CP 0 to x=970, y=1920
        Map<String, VehicleState> states1 = Map.of("p1", makeState(970, 1920, 0));
        tracker.update(0.050, states1);

        assertTrue(p1.isHasCrossedStartLine());
        assertEquals(1, p1.getNextCheckpointIndex());
        assertTrue(p1.getCheckpointsClearedInLap().contains(0));
    }

    @Test
    @DisplayName("Sequential checkpoint progression: clearing checkpoints in valid sequence")
    public void testSequentialCheckpointProgression() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");

        // 1. Cross start line (CP 0)
        tracker.update(0.050, Map.of("p1", makeState(860, 1920, 0)));
        tracker.update(0.050, Map.of("p1", makeState(970, 1920, 0)));
        assertEquals(1, p1.getNextCheckpointIndex());

        // 2. Cross CP 1
        TrackCheckpoint cp1 = track.getCheckpoints().get(1);
        double angle1 = cp1.getAngle();
        double cos1 = Math.cos(angle1);
        double sin1 = Math.sin(angle1);

        // Before CP 1
        tracker.update(0.050, Map.of("p1", makeState(cp1.getX() - 30 * cos1, cp1.getY() - 30 * sin1, angle1)));
        // Across CP 1
        tracker.update(0.050, Map.of("p1", makeState(cp1.getX() + 30 * cos1, cp1.getY() + 30 * sin1, angle1)));

        assertEquals(2, p1.getNextCheckpointIndex());
        assertTrue(p1.getCheckpointsClearedInLap().contains(1));
    }

    @Test
    @DisplayName("Shortcut rejection: skipping intermediate checkpoint is rejected")
    public void testShortcutRejection() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");

        // 1. Cross start line (CP 0) -> next checkpoint is CP 1
        tracker.update(0.050, Map.of("p1", makeState(860, 1920, 0)));
        tracker.update(0.050, Map.of("p1", makeState(970, 1920, 0)));
        assertEquals(1, p1.getNextCheckpointIndex());

        // 2. Attempt to cross CP 4 directly (skipping CP 1, 2, 3)
        TrackCheckpoint cp4 = track.getCheckpoints().get(4);
        double cos4 = Math.cos(cp4.getAngle());
        double sin4 = Math.sin(cp4.getAngle());

        tracker.update(0.050, Map.of("p1", makeState(cp4.getX() - 30 * cos4, cp4.getY() - 30 * sin4, cp4.getAngle())));
        tracker.update(0.050, Map.of("p1", makeState(cp4.getX() + 30 * cos4, cp4.getY() + 30 * sin4, cp4.getAngle())));

        // Next checkpoint must still be CP 1! CP 4 must not be cleared.
        assertEquals(1, p1.getNextCheckpointIndex());
        assertFalse(p1.getCheckpointsClearedInLap().contains(4));
    }

    @Test
    @DisplayName("Lap progression across all checkpoints advances lap count from 1 to 2")
    public void testLapProgression() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");
        List<TrackCheckpoint> cps = track.getCheckpoints();

        // Cross CP 0 initially
        tracker.update(0.050, Map.of("p1", makeState(860, 1920, 0)));
        tracker.update(0.050, Map.of("p1", makeState(970, 1920, 0)));

        // Sequentially cross all intermediate checkpoints 1 through 11
        for (int i = 1; i < cps.size(); i++) {
            TrackCheckpoint cp = cps.get(i);
            double cos = Math.cos(cp.getAngle());
            double sin = Math.sin(cp.getAngle());

            tracker.update(0.050, Map.of("p1", makeState(cp.getX() - 20 * cos, cp.getY() - 20 * sin, cp.getAngle())));
            tracker.update(0.050, Map.of("p1", makeState(cp.getX() + 20 * cos, cp.getY() + 20 * sin, cp.getAngle())));
        }

        assertEquals(0, p1.getNextCheckpointIndex()); // Ready to cross finish line for lap 1 completion

        // Cross CP 0 to finish Lap 1
        TrackCheckpoint cp0 = cps.get(0);
        tracker.update(0.050, Map.of("p1", makeState(cp0.getX() - 20, cp0.getY(), 0)));
        tracker.update(0.050, Map.of("p1", makeState(cp0.getX() + 20, cp0.getY(), 0)));

        // Lap 1 complete -> Now on Lap 2
        assertEquals(2, p1.getCurrentLap());
        assertEquals(1, p1.getNextCheckpointIndex());
        assertEquals(1, p1.getLapTimesMs().size());
        assertTrue(p1.getLapTimesMs().get(0) > 0);
    }

    @Test
    @DisplayName("Three lap completion marks racer finished with position 1")
    public void testThreeLapRaceCompletion() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");
        List<TrackCheckpoint> cps = track.getCheckpoints();

        // Simulate 3 full laps
        for (int lap = 1; lap <= 3; lap++) {
            // If lap 1, cross start line first
            if (lap == 1) {
                tracker.update(0.050, Map.of("p1", makeState(860, 1920, 0)));
                tracker.update(0.050, Map.of("p1", makeState(970, 1920, 0)));
            }

            // Cross CPs 1 to 11
            for (int i = 1; i < cps.size(); i++) {
                TrackCheckpoint cp = cps.get(i);
                double cos = Math.cos(cp.getAngle());
                double sin = Math.sin(cp.getAngle());
                tracker.update(0.050, Map.of("p1", makeState(cp.getX() - 20 * cos, cp.getY() - 20 * sin, cp.getAngle())));
                tracker.update(0.050, Map.of("p1", makeState(cp.getX() + 20 * cos, cp.getY() + 20 * sin, cp.getAngle())));
            }

            // Cross CP 0
            TrackCheckpoint cp0 = cps.get(0);
            tracker.update(0.050, Map.of("p1", makeState(cp0.getX() - 20, cp0.getY(), 0)));
            tracker.update(0.050, Map.of("p1", makeState(cp0.getX() + 20, cp0.getY(), 0)));
        }

        assertTrue(p1.isFinished());
        assertEquals(1, p1.getFinishPosition());
        assertEquals("FINISHED", p1.getStatus());
        assertEquals(3, p1.getLapTimesMs().size());
        assertTrue(tracker.isDnfCountdownActive(), "First place finish must activate 30-second DNF countdown");
        assertEquals("p1", tracker.getWinnerPlayerId());
    }

    @Test
    @DisplayName("30-second trailing player DNF countdown flags incomplete racers as DNF")
    public void testTrailingPlayerDnfCountdown() {
        CompetitorProgress p1 = tracker.getCompetitor("p1");
        CompetitorProgress p2 = tracker.getCompetitor("p2");
        List<TrackCheckpoint> cps = track.getCheckpoints();

        // p1 finishes 3 laps
        for (int lap = 1; lap <= 3; lap++) {
            if (lap == 1) {
                tracker.update(0.050, Map.of("p1", makeState(860, 1920, 0), "p2", makeState(800, 1948, 0)));
                tracker.update(0.050, Map.of("p1", makeState(970, 1920, 0), "p2", makeState(800, 1948, 0)));
            }
            for (int i = 1; i < cps.size(); i++) {
                TrackCheckpoint cp = cps.get(i);
                double cos = Math.cos(cp.getAngle());
                double sin = Math.sin(cp.getAngle());
                tracker.update(0.050, Map.of("p1", makeState(cp.getX() - 20 * cos, cp.getY() - 20 * sin, cp.getAngle()), "p2", makeState(800, 1948, 0)));
                tracker.update(0.050, Map.of("p1", makeState(cp.getX() + 20 * cos, cp.getY() + 20 * sin, cp.getAngle()), "p2", makeState(800, 1948, 0)));
            }
            TrackCheckpoint cp0 = cps.get(0);
            tracker.update(0.050, Map.of("p1", makeState(cp0.getX() - 20, cp0.getY(), 0), "p2", makeState(800, 1948, 0)));
            tracker.update(0.050, Map.of("p1", makeState(cp0.getX() + 20, cp0.getY(), 0), "p2", makeState(800, 1948, 0)));
        }

        assertTrue(p1.isFinished());
        assertFalse(p2.isFinished());
        assertTrue(tracker.isDnfCountdownActive());

        // Advance 25 seconds (less than 30s): p2 still not DNF
        for (int i = 0; i < 500; i++) {
            tracker.update(0.050, Map.of("p1", makeState(1000, 1920, 0), "p2", makeState(800, 1948, 0)));
        }
        assertFalse(p2.isFinished());

        // Advance remaining 6 seconds (total 31s > 30s): p2 is now marked DNF!
        for (int i = 0; i < 120; i++) {
            tracker.update(0.050, Map.of("p1", makeState(1000, 1920, 0), "p2", makeState(800, 1948, 0)));
        }

        assertTrue(p2.isFinished());
        assertEquals("DNF", p2.getStatus());
        assertEquals(2, p2.getFinishPosition());
        assertTrue(tracker.isRaceFinished());

        // Generate results
        RaceResultsPayload results = tracker.generateResults();
        assertNotNull(results);
        assertEquals(2, results.getResults().size());
        assertEquals(1, results.getResults().get(0).getPosition());
        assertEquals("p1", results.getResults().get(0).getPlayerId());
        assertEquals("FINISHED", results.getResults().get(0).getStatus());

        assertEquals(2, results.getResults().get(1).getPosition());
        assertEquals("p2", results.getResults().get(1).getPlayerId());
        assertEquals("DNF", results.getResults().get(1).getStatus());
    }
}
