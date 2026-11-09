package com.nitrorush.backend.physics.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NitroConfig {
    private double maxCapacity = 100.0;
    private double burnRate = 28.0;
    private double regenRate = 8.5;
    private double speedMultiplier = 1.35;
    private double accelMultiplier = 1.8;

    public NitroConfig() {}

    public NitroConfig(double maxCapacity, double burnRate, double regenRate, double speedMultiplier, double accelMultiplier) {
        this.maxCapacity = maxCapacity;
        this.burnRate = burnRate;
        this.regenRate = regenRate;
        this.speedMultiplier = speedMultiplier;
        this.accelMultiplier = accelMultiplier;
    }

    public double getMaxCapacity() { return maxCapacity; }
    public void setMaxCapacity(double maxCapacity) { this.maxCapacity = maxCapacity; }

    public double getBurnRate() { return burnRate; }
    public void setBurnRate(double burnRate) { this.burnRate = burnRate; }

    public double getRegenRate() { return regenRate; }
    public void setRegenRate(double regenRate) { this.regenRate = regenRate; }

    public double getSpeedMultiplier() { return speedMultiplier; }
    public void setSpeedMultiplier(double speedMultiplier) { this.speedMultiplier = speedMultiplier; }

    public double getAccelMultiplier() { return accelMultiplier; }
    public void setAccelMultiplier(double accelMultiplier) { this.accelMultiplier = accelMultiplier; }
}

