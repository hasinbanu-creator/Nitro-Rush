package com.nitrorush.backend.physics.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class VehicleStats {
    private double topSpeed;
    private double acceleration;
    private double handling;
    private double nitro;

    public VehicleStats() {}

    public VehicleStats(double topSpeed, double acceleration, double handling, double nitro) {
        this.topSpeed = topSpeed;
        this.acceleration = acceleration;
        this.handling = handling;
        this.nitro = nitro;
    }

    public double getTopSpeed() { return topSpeed; }
    public void setTopSpeed(double topSpeed) { this.topSpeed = topSpeed; }

    public double getAcceleration() { return acceleration; }
    public void setAcceleration(double acceleration) { this.acceleration = acceleration; }

    public double getHandling() { return handling; }
    public void setHandling(double handling) { this.handling = handling; }

    public double getNitro() { return nitro; }
    public void setNitro(double nitro) { this.nitro = nitro; }
}

