package com.nitrorush.backend.physics.engine;

import com.nitrorush.backend.physics.config.PhysicsConstants;
import com.nitrorush.backend.physics.config.TrackPhysicsConfig;
import com.nitrorush.backend.physics.config.VehicleConfig;
import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.physics.model.VehicleState;

/**
 * Pure, deterministic single-tick vehicle physics engine implementing exact
 * numerical formulas from Frontend/src/game/CarController.ts.
 */
public class PhysicsEngine {

    @FunctionalInterface
    public interface MiniTurboCallback {
        void onMiniTurboAwarded(double boostAmount);
    }

    public static class PerformanceParameters {
        public final double maxForwardSpeed;
        public final double maxReverseSpeed;
        public final double accelerationRate;
        public final double brakingRate;
        public final double turnRate;
        public final double nitroMultiplier;
        public final double nitroAccelMultiplier;
        public final double nitroConsumeRate;
        public final double nitroRegenRate;
        public final double maxNitro;
        public final double dragCoefficient;

        public PerformanceParameters(VehicleConfig carConfig, String difficulty) {
            double massKg = carConfig.getMassKg() > 0 ? carConfig.getMassKg() : PhysicsConstants.REFERENCE_MASS_KG;
            var stats = carConfig.getStats();
            var nitroConfig = carConfig.getNitroConfig();

            this.maxForwardSpeed = 360.0 + (stats.getTopSpeed() / 100.0) * 355.0;
            this.maxReverseSpeed = this.maxForwardSpeed * 0.28;
            this.accelerationRate = 260.0 + (stats.getAcceleration() / 100.0) * 520.0;

            double massFactor = Math.pow(PhysicsConstants.REFERENCE_MASS_KG / massKg, 0.70);
            this.brakingRate = 840.0 * massFactor;
            this.turnRate = 2.1 + (stats.getHandling() / 100.0) * 1.5;

            this.nitroMultiplier = nitroConfig.getSpeedMultiplier();
            this.nitroAccelMultiplier = nitroConfig.getAccelMultiplier();
            this.nitroConsumeRate = nitroConfig.getBurnRate();
            double regen = nitroConfig.getRegenRate();
            this.maxNitro = nitroConfig.getMaxCapacity();

            double drag = 0.988;
            if ("EASY".equalsIgnoreCase(difficulty)) {
                regen *= 1.35;
                drag = 0.990;
            } else if ("HARD".equalsIgnoreCase(difficulty)) {
                regen *= 0.85;
                drag = 0.985;
            }
            this.nitroRegenRate = regen;
            this.dragCoefficient = drag;
        }
    }

    /**
     * Executes a single physics simulation tick.
     *
     * @param state Vehicle state to update in place
     * @param input Normalized, validated player input
     * @param isControlsLocked If true, applies countdown rolling deceleration
     * @param isOnTrack If true, on road surface; if false, applies off-road penalty
     * @param worldWidth World boundary width in pixels
     * @param worldHeight World boundary height in pixels
     * @param trackPhysics Track physics parameters
     * @param dt Delta time in seconds (strictly 0.050s for 20 TPS)
     * @param carConfig Vehicle configuration parameters
     * @param difficulty Difficulty ("EASY", "MEDIUM", "HARD")
     * @param callback Optional mini-turbo callback
     */
    public void update(
            VehicleState state,
            PlayerInput input,
            boolean isControlsLocked,
            boolean isOnTrack,
            double worldWidth,
            double worldHeight,
            TrackPhysicsConfig trackPhysics,
            double dt,
            VehicleConfig carConfig,
            String difficulty,
            MiniTurboCallback callback
    ) {
        if (trackPhysics == null) {
            trackPhysics = new TrackPhysicsConfig();
        }
        if (input == null) {
            input = PlayerInput.neutral();
        }

        PerformanceParameters p = new PerformanceParameters(carConfig, difficulty);

        if (isControlsLocked) {
            state.vx *= Math.pow(0.85, dt * 60.0);
            state.vy *= Math.pow(0.85, dt * 60.0);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            state.forwardSpeed = 0.0;
            state.lateralSpeed = 0.0;
            state.currentSpeedKMH = 0;
            return;
        }

        // 1. Heading vectors for orientation
        double prevFwdX = Math.cos(state.rotation);
        double prevFwdY = Math.sin(state.rotation);
        double prevRightX = -prevFwdY;
        double prevRightY = prevFwdX;

        // Current forward & lateral speeds in car reference frame prior to rotation
        double fwdSpeed = state.vx * prevFwdX + state.vy * prevFwdY;
        double latSpeed = state.vx * prevRightX + state.vy * prevRightY;

        // 2. Nitro Boost Logic
        if (input.isNitro() && state.nitroAmount > 0 && input.getThrottle() > 0 && !state.isReverseGear) {
            state.isNitroActive = true;
            state.nitroAmount = Math.max(0.0, state.nitroAmount - p.nitroConsumeRate * dt);
        } else {
            state.isNitroActive = false;
            state.nitroAmount = Math.min(p.maxNitro, state.nitroAmount + p.nitroRegenRate * dt);
        }

        // Effective maximum forward speed and acceleration (penalized off-road, with AWD traction bonus)
        double offRoadTraction = carConfig.getHandlingConfig().getOffRoadTractionBonus();
        double effectiveOffRoadPenalty = Math.min(1.0, trackPhysics.getOffRoadPenalty() * offRoadTraction);

        double baseTargetMaxSpeed = state.isNitroActive
                ? p.maxForwardSpeed * p.nitroMultiplier
                : p.maxForwardSpeed;

        double currentMaxSpeed = baseTargetMaxSpeed;
        if (!isOnTrack) {
            double offRoadSpeedCap = p.maxForwardSpeed * effectiveOffRoadPenalty;
            currentMaxSpeed = Math.min(baseTargetMaxSpeed, offRoadSpeedCap);
        }

        double currentAccelRate;
        if (state.isNitroActive) {
            currentAccelRate = p.accelerationRate * p.nitroAccelMultiplier;
        } else if (isOnTrack) {
            currentAccelRate = p.accelerationRate * trackPhysics.getAccelMultiplier();
        } else {
            currentAccelRate = p.accelerationRate * trackPhysics.getAccelMultiplier() * Math.min(1.0, 0.70 * offRoadTraction);
        }

        // 3. Throttle, Braking & Transmission (Forward / Reverse State Machine)
        if (input.getBrake() > 0) {
            if (fwdSpeed > PhysicsConstants.ZERO_SPEED_DEADZONE) {
                // Active forward braking
                state.brakeHoldTimer = 0.0;
                state.isReverseGear = false;
                double effectiveBraking = p.brakingRate * trackPhysics.getBrakingMultiplier();
                fwdSpeed -= effectiveBraking * input.getBrake() * dt;
                if (fwdSpeed < 0) {
                    fwdSpeed = 0.0;
                }
            } else if (!state.isReverseGear) {
                // Not in reverse gear: bringing to standstill or stopped in deadzone
                fwdSpeed = 0.0;
                state.brakeHoldTimer += dt;
                if (state.brakeHoldTimer >= PhysicsConstants.REVERSE_ENGAGE_THRESHOLD) {
                    state.isReverseGear = true;
                    fwdSpeed -= (p.accelerationRate * 0.55) * input.getBrake() * dt;
                }
            } else {
                // Already in reverse gear: allow continuous reverse acceleration up to maxReverseSpeed
                fwdSpeed -= (p.accelerationRate * 0.55) * input.getBrake() * dt;
                if (fwdSpeed < -p.maxReverseSpeed) {
                    fwdSpeed = -p.maxReverseSpeed;
                }
            }
        } else if (input.getThrottle() > 0) {
            state.brakeHoldTimer = 0.0;
            if (state.isReverseGear || fwdSpeed < -PhysicsConstants.ZERO_SPEED_DEADZONE) {
                double effectiveBraking = p.brakingRate * trackPhysics.getBrakingMultiplier();
                fwdSpeed += effectiveBraking * input.getThrottle() * dt;
                if (fwdSpeed >= 0) {
                    fwdSpeed = 0.0;
                    state.isReverseGear = false;
                }
            } else {
                state.isReverseGear = false;
                if (fwdSpeed < currentMaxSpeed) {
                    fwdSpeed += currentAccelRate * input.getThrottle() * dt;
                    if (fwdSpeed > currentMaxSpeed) {
                        fwdSpeed = currentMaxSpeed;
                    }
                } else if (!isOnTrack && fwdSpeed > currentMaxSpeed) {
                    fwdSpeed -= 260.0 * dt;
                    if (fwdSpeed < currentMaxSpeed) {
                        fwdSpeed = currentMaxSpeed;
                    }
                }
            }
        } else {
            state.brakeHoldTimer = 0.0;
            double coastDrag = isOnTrack ? p.dragCoefficient : trackPhysics.getOffRoadDrag();
            fwdSpeed *= Math.pow(coastDrag, dt * 60.0);
            if (Math.abs(fwdSpeed) <= PhysicsConstants.ZERO_SPEED_DEADZONE) {
                fwdSpeed = 0.0;
                state.isReverseGear = false;
            }
        }

        // 4. Steering Dynamics with Smooth Low-Speed Ease Curve and Drift Yaw Stabilization
        double currVx = fwdSpeed * prevFwdX + latSpeed * prevRightX;
        double currVy = fwdSpeed * prevFwdY + latSpeed * prevRightY;
        double totalSpeed = Math.sqrt(currVx * currVx + currVy * currVy);
        double minAgility = carConfig.getHandlingConfig().getLowSpeedAgility();
        double speedRatio = Math.min(totalSpeed / 140.0, 1.0);
        double smoothEase = Math.sin((speedRatio * Math.PI) / 2.0);
        double steerSpeedRatio = totalSpeed < 5.0 ? 0.0 : minAgility + (1.0 - minAgility) * smoothEase;

        boolean isDriftRequested = (input.isDrift() || (trackPhysics.getDriftEaseFactor() > 1.25 && Math.abs(input.getSteer()) > 0.8 && totalSpeed > 140.0)) && totalSpeed > 90.0;

        double yawDamping = 1.0;
        if (isDriftRequested && state.driftAngleDeg > 24.0) {
            boolean isCounterSteer = (state.lateralSpeed * input.getSteer() > 0);
            if (isCounterSteer) {
                yawDamping = 1.30;
            } else {
                yawDamping = Math.max(0.10, 1.0 - (state.driftAngleDeg - 24.0) / 12.0);
            }
        }

        double effectiveTurnRate = isDriftRequested
                ? p.turnRate * carConfig.getHandlingConfig().getDriftTurnMultiplier() * trackPhysics.getDriftEaseFactor() * yawDamping
                : p.turnRate * (isOnTrack ? Math.min(1.05, 0.95 + trackPhysics.getGripMultiplier() * 0.05) : 0.85);

        if (input.getSteer() != 0.0 && steerSpeedRatio > 0.0) {
            double reverseDir = fwdSpeed < 0.0 ? -1.0 : 1.0;
            state.rotation += input.getSteer() * effectiveTurnRate * steerSpeedRatio * reverseDir * dt;
        }

        // 5. TRUE 2D LATERAL MOMENTUM AND DRIFT SLIP
        double newFwdX = Math.cos(state.rotation);
        double newFwdY = Math.sin(state.rotation);
        double newRightX = -newFwdY;
        double newRightY = newFwdX;

        double projectedFwd = currVx * newFwdX + currVy * newFwdY;
        double projectedLat = currVx * newRightX + currVy * newRightY;

        double surfaceGrip = isOnTrack ? trackPhysics.getGripMultiplier() : (trackPhysics.getGripMultiplier() * 0.82);
        double baseGrip = carConfig.getHandlingConfig().getBaseLateralGrip();
        double driftRetention = carConfig.getHandlingConfig().getDriftGripRetention();

        double lateralGripFactor = isDriftRequested
                ? Math.min(0.97, driftRetention + (1.0 - surfaceGrip) * 0.08)
                : Math.max(0.70, Math.min(0.90, baseGrip + (1.0 - surfaceGrip) * 0.35));

        projectedLat *= Math.pow(lateralGripFactor, dt * 60.0);
        if (Math.abs(projectedLat) < 2.0) {
            projectedLat = 0.0;
        }

        state.forwardSpeed = projectedFwd;
        state.lateralSpeed = projectedLat;

        state.driftAngle = Math.atan2(state.lateralSpeed, Math.max(20.0, Math.abs(state.forwardSpeed)));
        state.driftAngleDeg = Math.abs(state.driftAngle * (180.0 / Math.PI));

        boolean isCurrentlySlipping = Math.abs(state.lateralSpeed) > 45.0 || state.driftAngleDeg >= 12.0;
        state.isDrifting = (isDriftRequested && totalSpeed > 100.0) || (isCurrentlySlipping && totalSpeed > 100.0);

        // 6. Drift-to-Nitro Mini-Turbo Reward System
        if (state.isDrifting && totalSpeed > 100.0) {
            state.driftDuration += dt;
            if (isCurrentlySlipping && state.driftDuration >= PhysicsConstants.MINI_TURBO_SLIP_QUALIFY_TIME) {
                state.hasQualifyingSlip = true;
            }
        } else {
            if (state.hasQualifyingSlip && state.driftDuration >= PhysicsConstants.MINI_TURBO_MIN_DURATION && totalSpeed > 90.0 && state.driftAngleDeg < PhysicsConstants.MINI_TURBO_MAX_EXIT_ANGLE_DEG) {
                double rewardAmount = PhysicsConstants.MINI_TURBO_REWARD;
                state.nitroAmount = Math.min(p.maxNitro, state.nitroAmount + rewardAmount);
                if (callback != null) {
                    callback.onMiniTurboAwarded(rewardAmount);
                }
            }
            state.driftDuration = 0.0;
            state.hasQualifyingSlip = false;
        }

        if (totalSpeed < 50.0) {
            state.driftDuration = 0.0;
            state.hasQualifyingSlip = false;
        }

        // 7. Reconstruct World Velocity
        state.vx = state.forwardSpeed * newFwdX + state.lateralSpeed * newRightX;
        state.vy = state.forwardSpeed * newFwdY + state.lateralSpeed * newRightY;

        double effectiveDrag = isOnTrack
                ? (state.isNitroActive ? Math.min(0.993, p.dragCoefficient + 0.004) : p.dragCoefficient)
                : trackPhysics.getOffRoadDrag();
        state.vx *= Math.pow(effectiveDrag, dt * 60.0);
        state.vy *= Math.pow(effectiveDrag, dt * 60.0);

        state.forwardSpeed = state.vx * newFwdX + state.vy * newFwdY;
        state.lateralSpeed = state.vx * newRightX + state.vy * newRightY;

        // 8. Update Position & Enforce World Boundaries
        state.x += state.vx * dt;
        state.y += state.vy * dt;

        if (state.x < PhysicsConstants.WORLD_BORDER_MARGIN) {
            state.x = PhysicsConstants.WORLD_BORDER_MARGIN;
            state.vx = Math.abs(state.vx) * PhysicsConstants.WORLD_BORDER_RESTITUTION;
        } else if (state.x > worldWidth - PhysicsConstants.WORLD_BORDER_MARGIN) {
            state.x = worldWidth - PhysicsConstants.WORLD_BORDER_MARGIN;
            state.vx = -Math.abs(state.vx) * PhysicsConstants.WORLD_BORDER_RESTITUTION;
        }

        if (state.y < PhysicsConstants.WORLD_BORDER_MARGIN) {
            state.y = PhysicsConstants.WORLD_BORDER_MARGIN;
            state.vy = Math.abs(state.vy) * PhysicsConstants.WORLD_BORDER_RESTITUTION;
        } else if (state.y > worldHeight - PhysicsConstants.WORLD_BORDER_MARGIN) {
            state.y = worldHeight - PhysicsConstants.WORLD_BORDER_MARGIN;
            state.vy = -Math.abs(state.vy) * PhysicsConstants.WORLD_BORDER_RESTITUTION;
        }

        // 9. Calculate HUD Speed in KM/H (1 px/s ≈ 0.40 KM/H)
        double currentSpeedPixels = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
        state.currentSpeedKMH = (int) Math.round(currentSpeedPixels * PhysicsConstants.KMH_CONVERSION_FACTOR);
    }
}

