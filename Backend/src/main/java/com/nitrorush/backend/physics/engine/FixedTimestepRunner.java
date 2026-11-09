package com.nitrorush.backend.physics.engine;

import com.nitrorush.backend.physics.config.PhysicsConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Accumulator-based fixed-timestep simulation runner executing authoritative 50ms ticks.
 */
public class FixedTimestepRunner {

    private static final Logger log = LoggerFactory.getLogger(FixedTimestepRunner.class);

    private final double fixedTimestep;
    private final double maxAccumulatedTime;
    private double accumulator = 0.0;
    private long tickIndex = 0;
    private double totalSimulatedTime = 0.0;

    public FixedTimestepRunner() {
        this(PhysicsConstants.FIXED_TIMESTEP, PhysicsConstants.FIXED_TIMESTEP * 5.0); // 50ms step, 250ms clamp
    }

    public FixedTimestepRunner(double fixedTimestep, double maxAccumulatedTime) {
        this.fixedTimestep = fixedTimestep;
        this.maxAccumulatedTime = maxAccumulatedTime;
    }

    /**
     * Advances the accumulator by the elapsed real time and executes ticks as necessary.
     *
     * @param elapsedSeconds Wall-clock elapsed time in seconds
     * @param tickAction Action executed once per consumed 50ms tick
     * @return Number of ticks executed in this update
     */
    public int advance(double elapsedSeconds, Consumer tickAction) {
        if (elapsedSeconds < 0.0) {
            return 0;
        }

        accumulator += elapsedSeconds;

        // Spiral of death overload policy: clamp to prevent CPU runaway
        if (accumulator > maxAccumulatedTime) {
            log.warn("Accumulator clamped: {}s exceeded max {}s. Dropping lost time.", accumulator, maxAccumulatedTime);
            accumulator = maxAccumulatedTime;
        }

        int ticksProcessed = 0;
        while (accumulator >= fixedTimestep) {
            tickIndex++;
            totalSimulatedTime += fixedTimestep;
            accumulator -= fixedTimestep;
            ticksProcessed++;

            if (tickAction != null) {
                tickAction.accept(tickIndex, fixedTimestep);
            }
        }

        return ticksProcessed;
    }

    public void reset() {
        accumulator = 0.0;
        tickIndex = 0;
        totalSimulatedTime = 0.0;
    }

    public double getFixedTimestep() { return fixedTimestep; }
    public double getAccumulator() { return accumulator; }
    public long getTickIndex() { return tickIndex; }
    public double getTotalSimulatedTime() { return totalSimulatedTime; }

    @FunctionalInterface
    public interface Consumer {
        void accept(long currentTick, double dt);
    }
}

