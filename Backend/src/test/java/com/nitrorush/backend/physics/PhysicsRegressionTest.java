package com.nitrorush.backend.physics;

import com.nitrorush.backend.physics.config.PhysicsConstants;
import com.nitrorush.backend.physics.config.VehicleConfig;
import com.nitrorush.backend.physics.config.VehicleRegistry;
import com.nitrorush.backend.physics.engine.FixedTimestepRunner;
import com.nitrorush.backend.physics.engine.PhysicsEngine;
import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.simulation.RaceSimulationWorld;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive physics regression, determinism, and boundary stability test suite.
 */
public class PhysicsRegressionTest {

    private static final Logger log = LoggerFactory.getLogger(PhysicsRegressionTest.class);

    private static final String[] VEHICLES = { "bolt-gt", "viper-r", "rally-apex", "titan-v8" };
    private static final String[] TRACKS = {
            "coastal-rush", "city-nights", "mountain-pass", "desert-heat",
            "forest-trail", "snow-peaks", "volcano-run", "rural-village", "space-station"
    };

    private final PhysicsEngine physicsEngine = new PhysicsEngine();

    public static Stream<Arguments> provideVehicleTrackMatrix() {
        List<Arguments> args = new ArrayList<>();
        for (String v : VEHICLES) {
            for (String t : TRACKS) {
                args.add(Arguments.of(v, t));
            }
        }
        return args.stream();
    }

    @ParameterizedTest(name = "Matrix: Car={0}, Track={1}")
    @MethodSource("provideVehicleTrackMatrix")
    @DisplayName("4 Vehicles x 9 Tracks Full Matrix Simulation (100 ticks)")
    public void testVehicleTrackMatrix(String vehicleId, String trackId) {
        VehicleConfig car = VehicleRegistry.getStatic(vehicleId);
        TrackDefinition track = TrackRegistry.getStatic(trackId);

        assertNotNull(car, "Car config must exist: " + vehicleId);
        assertNotNull(track, "Track definition must exist: " + trackId);

        VehicleState state = new VehicleState(1000, 1000, 0, 100);
        double maxAllowedSpeed = (360 + 355) * car.getNitroConfig().getSpeedMultiplier() + 50.0;

        for (int tick = 1; tick <= 100; tick++) {
            // Dynamic varied driving input
            double throttle = (tick % 20 < 15) ? 1.0 : 0.0;
            double brake = (tick % 20 >= 15) ? 0.8 : 0.0;
            double steer = (tick > 30 && tick < 70) ? 0.6 : 0.0;
            boolean drift = (tick > 40 && tick < 65);
            boolean nitro = (tick > 10 && tick < 30);

            PlayerInput input = PlayerInput.of(throttle, brake, steer, drift, nitro);

            physicsEngine.update(
                    state,
                    input,
                    false,
                    true,
                    track.getWorldWidth(),
                    track.getWorldHeight(),
                    track.getPhysics(),
                    PhysicsConstants.FIXED_TIMESTEP,
                    car,
                    track.getDifficulty(),
                    null
            );

            // Assertions for stability and bounded dynamics
            assertFalse(Double.isNaN(state.x), "x is NaN at tick " + tick);
            assertFalse(Double.isInfinite(state.x), "x is Infinite at tick " + tick);
            assertFalse(Double.isNaN(state.y), "y is NaN at tick " + tick);
            assertFalse(Double.isInfinite(state.y), "y is Infinite at tick " + tick);
            assertFalse(Double.isNaN(state.vx), "vx is NaN at tick " + tick);
            assertFalse(Double.isNaN(state.vy), "vy is NaN at tick " + tick);
            assertFalse(Double.isNaN(state.rotation), "rotation is NaN at tick " + tick);

            assertTrue(state.x >= PhysicsConstants.WORLD_BORDER_MARGIN, "x out of bounds below margin");
            assertTrue(state.x <= track.getWorldWidth() - PhysicsConstants.WORLD_BORDER_MARGIN, "x out of bounds above margin");
            assertTrue(state.y >= PhysicsConstants.WORLD_BORDER_MARGIN, "y out of bounds below margin");
            assertTrue(state.y <= track.getWorldHeight() - PhysicsConstants.WORLD_BORDER_MARGIN, "y out of bounds above margin");

            double totalSpeed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
            assertTrue(totalSpeed <= maxAllowedSpeed, "Speed runaway: " + totalSpeed + " > " + maxAllowedSpeed);

            assertTrue(state.nitroAmount >= 0.0 && state.nitroAmount <= car.getNitroConfig().getMaxCapacity() + 0.01,
                    "Nitro out of bounds: " + state.nitroAmount);
        }
    }

    @Test
    @DisplayName("Deterministic Simulation: Bitwise Identical Outputs across 200 ticks")
    public void testBitwiseDeterminism() {
        TrackDefinition track = TrackRegistry.getStatic("coastal-rush");
        VehicleConfig car1Config = VehicleRegistry.getStatic("bolt-gt");
        VehicleConfig car2Config = VehicleRegistry.getStatic("titan-v8");

        RaceSimulationWorld world1 = new RaceSimulationWorld(track, "MEDIUM");
        world1.addVehicle("v1", car1Config, new VehicleState(500, 500, 0, 100));
        world1.addVehicle("v2", car2Config, new VehicleState(600, 500, Math.PI, 100));

        RaceSimulationWorld world2 = new RaceSimulationWorld(track, "MEDIUM");
        world2.addVehicle("v1", car1Config, new VehicleState(500, 500, 0, 100));
        world2.addVehicle("v2", car2Config, new VehicleState(600, 500, Math.PI, 100));

        for (int tick = 1; tick <= 200; tick++) {
            PlayerInput input1 = PlayerInput.of(
                    (tick % 10 < 8) ? 1.0 : 0.0,
                    (tick % 10 >= 8) ? 1.0 : 0.0,
                    Math.sin(tick * 0.1),
                    tick % 25 > 15,
                    tick % 40 < 10
            );
            PlayerInput input2 = PlayerInput.of(
                    1.0,
                    0.0,
                    Math.cos(tick * 0.1),
                    false,
                    tick % 30 < 15
            );

            world1.updateInput("v1", input1);
            world1.updateInput("v2", input2);
            world2.updateInput("v1", input1);
            world2.updateInput("v2", input2);

            world1.step();
            world2.step();

            Map<String, VehicleState> snap1 = world1.getSnapshot();
            Map<String, VehicleState> snap2 = world2.getSnapshot();

            for (String vid : List.of("v1", "v2")) {
                VehicleState s1 = snap1.get(vid);
                VehicleState s2 = snap2.get(vid);

                assertEquals(Double.doubleToLongBits(s1.x), Double.doubleToLongBits(s2.x), "Bitwise x mismatch at tick " + tick);
                assertEquals(Double.doubleToLongBits(s1.y), Double.doubleToLongBits(s2.y), "Bitwise y mismatch at tick " + tick);
                assertEquals(Double.doubleToLongBits(s1.vx), Double.doubleToLongBits(s2.vx), "Bitwise vx mismatch at tick " + tick);
                assertEquals(Double.doubleToLongBits(s1.vy), Double.doubleToLongBits(s2.vy), "Bitwise vy mismatch at tick " + tick);
                assertEquals(Double.doubleToLongBits(s1.rotation), Double.doubleToLongBits(s2.rotation), "Bitwise rotation mismatch at tick " + tick);
                assertEquals(Double.doubleToLongBits(s1.nitroAmount), Double.doubleToLongBits(s2.nitroAmount), "Bitwise nitro mismatch at tick " + tick);
                assertEquals(s1.isReverseGear, s2.isReverseGear, "Reverse gear state mismatch at tick " + tick);
                assertEquals(s1.isDrifting, s2.isDrifting, "Drifting state mismatch at tick " + tick);
            }
        }
    }

    @Test
    @DisplayName("Input Sanitization & Edge-Case Protection")
    public void testInputSanitization() {
        PlayerInput input = PlayerInput.of(-5.0, 10.0, 99.0, false, false);
        assertEquals(0.0, input.getThrottle(), 1e-6);
        assertEquals(1.0, input.getBrake(), 1e-6);
        assertEquals(1.0, input.getSteer(), 1e-6);

        PlayerInput nanInput = PlayerInput.of(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, true, true);
        assertEquals(0.0, nanInput.getThrottle(), 1e-6);
        assertEquals(0.0, nanInput.getBrake(), 1e-6);
        assertEquals(0.0, nanInput.getSteer(), 1e-6);
        assertTrue(nanInput.isDrift());
        assertTrue(nanInput.isNitro());
    }

    @Test
    @DisplayName("World Border Rebound Restitution on All 4 Canvas Edges")
    public void testWorldBorderRestitution() {
        VehicleConfig car = VehicleRegistry.getStatic("bolt-gt");
        TrackDefinition track = TrackRegistry.getStatic("coastal-rush");

        // West border rebound
        VehicleState westCar = new VehicleState(52, 500, Math.PI, 100);
        westCar.vx = -100.0;
        westCar.forwardSpeed = 100.0;
        physicsEngine.update(westCar, PlayerInput.neutral(), false, true, 3200, 2400, track.getPhysics(), 0.05, car, "MEDIUM", null);
        assertEquals(PhysicsConstants.WORLD_BORDER_MARGIN, westCar.x, 1e-6);
        assertEquals(100.0 * PhysicsConstants.WORLD_BORDER_RESTITUTION, westCar.vx, 5.0); // positive rebound velocity

        // East border rebound
        VehicleState eastCar = new VehicleState(3148, 500, 0, 100);
        eastCar.vx = 100.0;
        eastCar.forwardSpeed = 100.0;
        physicsEngine.update(eastCar, PlayerInput.neutral(), false, true, 3200, 2400, track.getPhysics(), 0.05, car, "MEDIUM", null);
        assertEquals(3200 - PhysicsConstants.WORLD_BORDER_MARGIN, eastCar.x, 1e-6);
        assertEquals(-100.0 * PhysicsConstants.WORLD_BORDER_RESTITUTION, eastCar.vx, 5.0); // negative rebound velocity

        // North border rebound
        VehicleState northCar = new VehicleState(500, 52, Math.PI / 2, 100);
        northCar.vy = -100.0;
        physicsEngine.update(northCar, PlayerInput.neutral(), false, true, 3200, 2400, track.getPhysics(), 0.05, car, "MEDIUM", null);
        assertEquals(PhysicsConstants.WORLD_BORDER_MARGIN, northCar.y, 1e-6);
        assertEquals(100.0 * PhysicsConstants.WORLD_BORDER_RESTITUTION, northCar.vy, 5.0);

        // South border rebound
        VehicleState southCar = new VehicleState(500, 2348, Math.PI / 2, 100);
        southCar.vy = 100.0;
        physicsEngine.update(southCar, PlayerInput.neutral(), false, true, 3200, 2400, track.getPhysics(), 0.05, car, "MEDIUM", null);
        assertEquals(2400 - PhysicsConstants.WORLD_BORDER_MARGIN, southCar.y, 1e-6);
        assertEquals(-100.0 * PhysicsConstants.WORLD_BORDER_RESTITUTION, southCar.vy, 5.0);
    }

    @Test
    @DisplayName("FixedTimestepRunner Accumulator and Overload Clamping")
    public void testFixedTimestepRunnerOverload() {
        FixedTimestepRunner runner = new FixedTimestepRunner();
        int[] ticksExecuted = {0};

        // Advance by exact 50ms: exactly 1 tick
        int ticks = runner.advance(0.050, (t, dt) -> ticksExecuted[0]++);
        assertEquals(1, ticks);
        assertEquals(1, ticksExecuted[0]);
        assertEquals(0.0, runner.getAccumulator(), 1e-6);

        // Advance by 125ms: exactly 2 ticks (100ms consumed, 25ms remaining)
        ticks = runner.advance(0.125, (t, dt) -> ticksExecuted[0]++);
        assertEquals(2, ticks);
        assertEquals(3, ticksExecuted[0]);
        assertEquals(0.025, runner.getAccumulator(), 1e-6);

        // Advance by massive 10 seconds: must clamp to 250ms (max 5 ticks consumed)
        ticksExecuted[0] = 0;
        ticks = runner.advance(10.0, (t, dt) -> ticksExecuted[0]++);
        assertEquals(5, ticks);
        assertEquals(5, ticksExecuted[0]);
        assertEquals(0.0, runner.getAccumulator(), 1e-6);
    }
}
