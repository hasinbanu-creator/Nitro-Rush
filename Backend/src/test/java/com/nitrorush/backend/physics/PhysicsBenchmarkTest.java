package com.nitrorush.backend.physics;

import com.nitrorush.backend.physics.config.VehicleConfig;
import com.nitrorush.backend.physics.config.VehicleRegistry;
import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.simulation.RaceSimulationWorld;
import com.nitrorush.backend.physics.track.TrackDefinition;
import com.nitrorush.backend.physics.track.TrackRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Performance benchmark verifying that authoritative simulation ticks for 2, 4, and 8 vehicles
 * execute with extreme headroom under the 50 ms budget.
 */
public class PhysicsBenchmarkTest {

    private static final Logger log = LoggerFactory.getLogger(PhysicsBenchmarkTest.class);

    private static final int WARMUP_TICKS = 500;
    private static final int BENCHMARK_TICKS = 1000;

    @Test
    @DisplayName("Performance Benchmark: 2, 4, and 8 Vehicle Load Headroom")
    public void testPhysicsPerformanceHeadroom() {
        int[] vehicleCounts = { 2, 4, 8 };

        for (int count : vehicleCounts) {
            BenchmarkStats stats = runBenchmark(count);
            log.info("=== Headless Physics Benchmark ({} Vehicles) ===", count);
            log.info("Mean tick time:   {}/tick ({} ns)", formatDuration(stats.meanNanos), (long) stats.meanNanos);
            log.info("P95 tick time:    {}/tick ({} ns)", formatDuration(stats.p95Nanos), (long) stats.p95Nanos);
            log.info("P99 tick time:    {}/tick ({} ns)", formatDuration(stats.p99Nanos), (long) stats.p99Nanos);
            log.info("Max tick time:    {}/tick ({} ns)", formatDuration(stats.maxNanos), (long) stats.maxNanos);
            log.info("Budget consumed:  {:.4f}% of 50ms budget", (stats.meanNanos / 50_000_000.0) * 100.0);

            // Assert mean tick time is well under 5 ms (10% of 50ms budget)
            assertTrue(stats.meanNanos < 5_000_000,
                    String.format("Mean tick duration %.2f us exceeded 5ms for %d vehicles", stats.meanNanos / 1000.0, count));
        }
    }

    private BenchmarkStats runBenchmark(int vehicleCount) {
        TrackDefinition track = TrackRegistry.getStatic("coastal-rush");
        VehicleConfig[] configs = {
                VehicleRegistry.getStatic("bolt-gt"),
                VehicleRegistry.getStatic("viper-r"),
                VehicleRegistry.getStatic("rally-apex"),
                VehicleRegistry.getStatic("titan-v8")
        };

        RaceSimulationWorld world = new RaceSimulationWorld(track, "MEDIUM");
        for (int i = 0; i < vehicleCount; i++) {
            VehicleConfig cfg = configs[i % configs.length];
            // Stagger initial positions close enough to trigger frequent collisions
            VehicleState st = new VehicleState(1000 + (i * 30), 1000 + (i % 2) * 20, 0, 100);
            st.vx = 250 + (i * 10);
            world.addVehicle("v" + i, cfg, st);
        }

        // Warmup JIT
        for (int t = 0; t < WARMUP_TICKS; t++) {
            for (int i = 0; i < vehicleCount; i++) {
                world.updateInput("v" + i, PlayerInput.of(1.0, 0.0, (i % 2 == 0) ? 0.3 : -0.3, t % 20 > 10, false));
            }
            world.step();
        }

        // Timed benchmark
        long[] durations = new long[BENCHMARK_TICKS];
        for (int t = 0; t < BENCHMARK_TICKS; t++) {
            for (int i = 0; i < vehicleCount; i++) {
                world.updateInput("v" + i, PlayerInput.of(1.0, 0.0, (i % 2 == 0) ? 0.4 : -0.4, t % 30 > 15, t % 50 < 10));
            }
            long start = System.nanoTime();
            world.step();
            durations[t] = System.nanoTime() - start;
        }

        Arrays.sort(durations);
        long sum = 0;
        for (long d : durations) {
            sum += d;
        }

        double mean = (double) sum / BENCHMARK_TICKS;
        long p95 = durations[(int) (BENCHMARK_TICKS * 0.95)];
        long p99 = durations[(int) (BENCHMARK_TICKS * 0.99)];
        long max = durations[BENCHMARK_TICKS - 1];

        return new BenchmarkStats(mean, p95, p99, max);
    }

    private static String formatDuration(double nanos) {
        if (nanos < 1000) {
            return String.format("%.0f ns", nanos);
        } else if (nanos < 1_000_000) {
            return String.format("%.2f µs", nanos / 1000.0);
        } else {
            return String.format("%.2f ms", nanos / 1_000_000.0);
        }
    }

    private static class BenchmarkStats {
        final double meanNanos;
        final double p95Nanos;
        final double p99Nanos;
        final double maxNanos;

        BenchmarkStats(double meanNanos, double p95Nanos, double p99Nanos, double maxNanos) {
            this.meanNanos = meanNanos;
            this.p95Nanos = p95Nanos;
            this.p99Nanos = p99Nanos;
            this.maxNanos = maxNanos;
        }
    }
}

