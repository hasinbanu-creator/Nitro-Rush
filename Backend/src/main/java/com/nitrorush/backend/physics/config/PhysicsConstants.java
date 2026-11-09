package com.nitrorush.backend.physics.config;

/**
 * Fundamental physics constants matching Nitro Rush TypeScript specifications.
 */
public final class PhysicsConstants {

    private PhysicsConstants() {
        // Prevent instantiation
    }

    /** Authoritative fixed timestep in seconds (50 ms = 20 TPS) */
    public static final double FIXED_TIMESTEP = 0.050;

    /** Simulation ticks per second */
    public static final int TICKS_PER_SECOND = 20;

    /** Shared world boundary margin (pixels from canvas border) */
    public static final double WORLD_BORDER_MARGIN = 50.0;

    /** Restitution coefficient applied when rebounding off world borders */
    public static final double WORLD_BORDER_RESTITUTION = 0.32;

    /** Combined bounding diameter for two colliding vehicles (44 px, 22 px radius each) */
    public static final double COLLISION_MIN_DISTANCE = 44.0;

    /** Combined bounding diameter squared (44 * 44 = 1936) */
    public static final double COLLISION_MIN_DISTANCE_SQ = COLLISION_MIN_DISTANCE * COLLISION_MIN_DISTANCE;

    /** Speed threshold in px/s below which car is considered at complete standstill */
    public static final double ZERO_SPEED_DEADZONE = 8.0;

    /** Duration in seconds brake must be held while stopped to engage reverse gear (220 ms) */
    public static final double REVERSE_ENGAGE_THRESHOLD = 0.22;

    /** Minimum duration of qualifying slip required to qualify for mini-turbo (0.35 s) */
    public static final double MINI_TURBO_SLIP_QUALIFY_TIME = 0.35;

    /** Minimum total drift duration required to trigger mini-turbo reward (0.55 s) */
    public static final double MINI_TURBO_MIN_DURATION = 0.55;

    /** Maximum drift angle in degrees upon exit to award mini-turbo (12 deg) */
    public static final double MINI_TURBO_MAX_EXIT_ANGLE_DEG = 12.0;

    /** Mini-turbo nitro reward percentage (+15%) */
    public static final double MINI_TURBO_REWARD = 15.0;

    /** Velocity to HUD KM/H scaling factor (1 px/s ≈ 0.40 KM/H) */
    public static final double KMH_CONVERSION_FACTOR = 0.40;

    /** Default reference mass in KG */
    public static final double REFERENCE_MASS_KG = 1250.0;
}

