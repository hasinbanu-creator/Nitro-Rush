package com.nitrorush.backend.physics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.physics.collision.CollisionEngine;
import com.nitrorush.backend.physics.config.PhysicsConstants;
import com.nitrorush.backend.physics.config.VehicleConfig;
import com.nitrorush.backend.physics.config.VehicleRegistry;
import com.nitrorush.backend.physics.engine.PhysicsEngine;
import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Strict Cross-Language Conformance Suite comparing Java Physics Engine against
 * TypeScript reference implementation golden vectors across 100 ticks.
 *
 * Acceptance Criteria (Tick-by-tick across all 100 ticks):
 * - Position error: <= 0.5 pixels
 * - Velocity error: <= 0.1 px/s
 * - Heading error: <= 0.005 radians
 * - Nitro error: <= 0.1 percentage points
 */
public class PhysicsConformanceTest {

    private static final Logger log = LoggerFactory.getLogger(PhysicsConformanceTest.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private static final double MAX_POSITION_TOLERANCE = 0.5;
    private static final double MAX_VELOCITY_TOLERANCE = 0.1;
    private static final double MAX_HEADING_TOLERANCE = 0.005;
    private static final double MAX_NITRO_TOLERANCE = 0.1;

    private static JsonNode goldenRoot;
    private static TrackDefinition coastalRush;
    private static VehicleConfig boltGt;
    private static VehicleConfig viperR;
    private static VehicleConfig rallyApex;
    private static VehicleConfig titanV8;

    private final PhysicsEngine physicsEngine = new PhysicsEngine();

    @BeforeAll
    public static void setUp() throws Exception {
        try (InputStream is = PhysicsConformanceTest.class.getResourceAsStream("/golden/physics-conformance-vectors.json")) {
            assertNotNull(is, "Golden conformance vectors file not found on classpath");
            goldenRoot = mapper.readTree(is);
        }

        coastalRush = TrackRegistry.getStatic("coastal-rush");
        boltGt = VehicleRegistry.getStatic("bolt-gt");
        viperR = VehicleRegistry.getStatic("viper-r");
        rallyApex = VehicleRegistry.getStatic("rally-apex");
        titanV8 = VehicleRegistry.getStatic("titan-v8");

        assertNotNull(coastalRush, "coastal-rush track definition must be available");
        assertNotNull(boltGt, "bolt-gt vehicle config must be available");
        assertNotNull(viperR, "viper-r vehicle config must be available");
        assertNotNull(rallyApex, "rally-apex vehicle config must be available");
        assertNotNull(titanV8, "titan-v8 vehicle config must be available");
    }

    private static class ScenarioConformanceResult {
        double maxPosDiff = 0.0;
        double maxVelDiff = 0.0;
        double maxHeadingDiff = 0.0;
        double maxNitroDiff = 0.0;
        int maxPosTick = -1;
        int maxVelTick = -1;
        int maxHeadingTick = -1;
        int maxNitroTick = -1;

        void record(int tick, double posDiff, double velDiff, double headingDiff, double nitroDiff) {
            if (posDiff > maxPosDiff) {
                maxPosDiff = posDiff;
                maxPosTick = tick;
            }
            if (velDiff > maxVelDiff) {
                maxVelDiff = velDiff;
                maxVelTick = tick;
            }
            if (headingDiff > maxHeadingDiff) {
                maxHeadingDiff = headingDiff;
                maxHeadingTick = tick;
            }
            if (nitroDiff > maxNitroDiff) {
                maxNitroDiff = nitroDiff;
                maxNitroTick = tick;
            }
        }

        void assertTolerances(String scenarioName) {
            log.info("Scenario '{}' Max Errors -> Pos: {} px (tick {}), Vel: {} px/s (tick {}), Heading: {} rad (tick {}), Nitro: {} % (tick {})",
                    scenarioName, maxPosDiff, maxPosTick, maxVelDiff, maxVelTick, maxHeadingDiff, maxHeadingTick, maxNitroDiff, maxNitroTick);

            assertTrue(maxPosDiff <= MAX_POSITION_TOLERANCE,
                    String.format("[%s] Position error %.6f px exceeded tolerance %.2f px at tick %d",
                            scenarioName, maxPosDiff, MAX_POSITION_TOLERANCE, maxPosTick));

            assertTrue(maxVelDiff <= MAX_VELOCITY_TOLERANCE,
                    String.format("[%s] Velocity error %.6f px/s exceeded tolerance %.2f px/s at tick %d",
                            scenarioName, maxVelDiff, MAX_VELOCITY_TOLERANCE, maxVelTick));

            assertTrue(maxHeadingDiff <= MAX_HEADING_TOLERANCE,
                    String.format("[%s] Heading error %.6f rad exceeded tolerance %.4f rad at tick %d",
                            scenarioName, maxHeadingDiff, MAX_HEADING_TOLERANCE, maxHeadingTick));

            assertTrue(maxNitroDiff <= MAX_NITRO_TOLERANCE,
                    String.format("[%s] Nitro error %.6f %% exceeded tolerance %.2f %% at tick %d",
                            scenarioName, maxNitroDiff, MAX_NITRO_TOLERANCE, maxNitroTick));
        }
    }

    private static double angleDiff(double a, double b) {
        double diff = (a - b) % (2.0 * Math.PI);
        if (diff > Math.PI) diff -= 2.0 * Math.PI;
        if (diff < -Math.PI) diff += 2.0 * Math.PI;
        return Math.abs(diff);
    }

    private static double velMagnitudeDiff(VehicleState state, JsonNode goldenState) {
        double gvx = goldenState.get("vx").asDouble();
        double gvy = goldenState.get("vy").asDouble();
        double dvx = state.vx - gvx;
        double dvy = state.vy - gvy;
        return Math.sqrt(dvx * dvx + dvy * dvy);
    }

    private static double posDistanceDiff(VehicleState state, JsonNode goldenState) {
        double gx = goldenState.get("x").asDouble();
        double gy = goldenState.get("y").asDouble();
        double dx = state.x - gx;
        double dy = state.y - gy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private VehicleState parseInitialState(JsonNode node) {
        VehicleState s = new VehicleState();
        s.x = node.get("x").asDouble();
        s.y = node.get("y").asDouble();
        s.vx = node.get("vx").asDouble();
        s.vy = node.get("vy").asDouble();
        s.rotation = node.get("rotation").asDouble();
        s.forwardSpeed = node.get("forwardSpeed").asDouble();
        s.lateralSpeed = node.get("lateralSpeed").asDouble();
        s.currentSpeedKMH = node.get("currentSpeedKMH").asInt();
        s.nitroAmount = node.get("nitroAmount").asDouble();
        s.isNitroActive = node.get("isNitroActive").asBoolean();
        s.isDrifting = node.get("isDrifting").asBoolean();
        s.driftAngleDeg = node.get("driftAngleDeg").asDouble();
        s.driftDuration = node.get("driftDuration").asDouble();
        s.isReverseGear = node.get("isReverseGear").asBoolean();
        return s;
    }

    private PlayerInput parseInput(JsonNode node) {
        if (node == null || node.isNull()) {
            return PlayerInput.neutral();
        }
        return PlayerInput.of(
                node.get("throttle").asDouble(),
                node.get("brake").asDouble(),
                node.get("steer").asDouble(),
                node.get("drift").asBoolean(),
                node.get("nitro").asBoolean()
        );
    }

    @Test
    @DisplayName("Scenario 1: Straight Line Acceleration (100 ticks)")
    public void testScenario1StraightAcceleration() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_1_straight_acceleration");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, boltGt, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 1: Straight Acceleration");
    }

    @Test
    @DisplayName("Scenario 2: Full Braking from 600 px/s (100 ticks)")
    public void testScenario2Braking() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_2_braking");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, boltGt, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 2: Braking");
    }

    @Test
    @DisplayName("Scenario 3: Reverse Gear Transition & Throttle Recovery (100 ticks)")
    public void testScenario3ReverseTransition() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_3_reverse_transition");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, boltGt, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 3: Reverse Gear Transition");
    }

    @Test
    @DisplayName("Scenario 4: Steering & Turning Dynamics (100 ticks)")
    public void testScenario4SteeringTurning() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_4_steering_turning");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, boltGt, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 4: Steering & Turning");
    }

    @Test
    @DisplayName("Scenario 5: Drift & Counter-Steering (100 ticks)")
    public void testScenario5DriftCounterSteer() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_5_drift_counter_steer");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, viperR, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 5: Drift & Counter-Steer");
    }

    @Test
    @DisplayName("Scenario 6: Nitro Burn & Passive Regeneration (100 ticks)")
    public void testScenario6NitroBurnRegen() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_6_nitro_burn_regen");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, boltGt, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 6: Nitro Burn & Regen");
    }

    @Test
    @DisplayName("Scenario 7: Mini-Turbo Activation & Drift Exit (100 ticks)")
    public void testScenario7MiniTurbo() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_7_mini_turbo");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        int[] turboAwardTick = {-1};
        PhysicsEngine.MiniTurboCallback callback = (boost) -> {
            turboAwardTick[0] = (int) state.driftDuration;
        };

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            physicsEngine.update(state, input, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, viperR, "MEDIUM", callback);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 7: Mini-Turbo");
    }

    @Test
    @DisplayName("Scenario 8: Off-Road Handling & Drag on Rally Apex (100 ticks)")
    public void testScenario8OffRoad() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_8_off_road");
        JsonNode ticks = scenario.get("ticks");
        VehicleState state = parseInitialState(ticks.get(0).get("state"));
        ScenarioConformanceResult result = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input = parseInput(tickNode.get("input"));
            // isOnTrack = false
            physicsEngine.update(state, input, false, false, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, rallyApex, "MEDIUM", null);

            JsonNode gState = tickNode.get("state");
            double posDiff = posDistanceDiff(state, gState);
            double velDiff = velMagnitudeDiff(state, gState);
            double hDiff = angleDiff(state.rotation, gState.get("rotation").asDouble());
            double nDiff = Math.abs(state.nitroAmount - gState.get("nitroAmount").asDouble());

            result.record(i, posDiff, velDiff, hDiff, nDiff);
        }

        result.assertTolerances("Scenario 8: Off-Road Grip & Drag");
    }

    @Test
    @DisplayName("Scenario 9: Multi-Car Pairwise Collision & World Boundary Rebound (100 ticks)")
    public void testScenario9MultiCarCollisionAndBoundary() {
        JsonNode scenario = goldenRoot.get("scenarios").get("scenario_9_multi_car_collision_and_boundary");
        JsonNode ticks = scenario.get("ticks");

        VehicleState car1State = parseInitialState(ticks.get(0).get("car1"));
        VehicleState car2State = parseInitialState(ticks.get(0).get("car2"));

        CollisionEngine collisionEngine = new CollisionEngine();
        ScenarioConformanceResult result1 = new ScenarioConformanceResult();
        ScenarioConformanceResult result2 = new ScenarioConformanceResult();

        for (int i = 1; i <= 100; i++) {
            JsonNode tickNode = ticks.get(i);
            PlayerInput input1 = parseInput(tickNode.get("input1"));
            PlayerInput input2 = parseInput(tickNode.get("input2"));

            // 1. Single vehicle updates
            physicsEngine.update(car1State, input1, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, boltGt, "MEDIUM", null);
            physicsEngine.update(car2State, input2, false, true, 3200, 2400, coastalRush.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP, titanV8, "MEDIUM", null);

            // 2. Collision resolution
            List<CollisionEngine.CollisionProxy> proxies = List.of(
                    new CollisionEngine.CollisionProxy("car1", car1State, boltGt.getMassKg()),
                    new CollisionEngine.CollisionProxy("car2", car2State, titanV8.getMassKg())
            );
            collisionEngine.resolveCollisions(proxies);

            // Compare Car 1
            JsonNode gState1 = tickNode.get("car1");
            double posDiff1 = posDistanceDiff(car1State, gState1);
            double velDiff1 = velMagnitudeDiff(car1State, gState1);
            double hDiff1 = angleDiff(car1State.rotation, gState1.get("rotation").asDouble());
            double nDiff1 = Math.abs(car1State.nitroAmount - gState1.get("nitroAmount").asDouble());
            result1.record(i, posDiff1, velDiff1, hDiff1, nDiff1);

            // Compare Car 2
            JsonNode gState2 = tickNode.get("car2");
            double posDiff2 = posDistanceDiff(car2State, gState2);
            double velDiff2 = velMagnitudeDiff(car2State, gState2);
            double hDiff2 = angleDiff(car2State.rotation, gState2.get("rotation").asDouble());
            double nDiff2 = Math.abs(car2State.nitroAmount - gState2.get("nitroAmount").asDouble());
            result2.record(i, posDiff2, velDiff2, hDiff2, nDiff2);
        }

        result1.assertTolerances("Scenario 9: Car 1 (Bolt GT)");
        result2.assertTolerances("Scenario 9: Car 2 (Titan V8)");
    }
}

