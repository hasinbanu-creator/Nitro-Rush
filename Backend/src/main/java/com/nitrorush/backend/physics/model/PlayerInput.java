package com.nitrorush.backend.physics.model;

/**
 * Immutable validated player input for a single physics tick.
 */
public final class PlayerInput {

    private final double throttle;
    private final double brake;
    private final double steer;
    private final boolean drift;
    private final boolean nitro;

    private static final PlayerInput NEUTRAL = new PlayerInput(0.0, 0.0, 0.0, false, false);

    public PlayerInput(double throttle, double brake, double steer, boolean drift, boolean nitro) {
        this.throttle = sanitize(throttle, 0.0, 1.0);
        this.brake = sanitize(brake, 0.0, 1.0);
        this.steer = sanitize(steer, -1.0, 1.0);
        this.drift = drift;
        this.nitro = nitro;
    }

    public static PlayerInput neutral() {
        return NEUTRAL;
    }

    public static PlayerInput of(double throttle, double brake, double steer, boolean drift, boolean nitro) {
        return new PlayerInput(throttle, brake, steer, drift, nitro);
    }

    private static double sanitize(double val, double min, double max) {
        if (Double.isNaN(val) || Double.isInfinite(val)) {
            return 0.0;
        }
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }

    public double getThrottle() { return throttle; }
    public double getBrake() { return brake; }
    public double getSteer() { return steer; }
    public boolean isDrift() { return drift; }
    public boolean isNitro() { return nitro; }

    @Override
    public String toString() {
        return "PlayerInput{" +
                "throttle=" + throttle +
                ", brake=" + brake +
                ", steer=" + steer +
                ", drift=" + drift +
                ", nitro=" + nitro +
                '}';
    }
}

