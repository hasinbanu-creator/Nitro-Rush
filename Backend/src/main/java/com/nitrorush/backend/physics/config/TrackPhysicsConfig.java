package com.nitrorush.backend.physics.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TrackPhysicsConfig {
    private double gripMultiplier = 1.0;
    private double accelMultiplier = 1.0;
    private double brakingMultiplier = 1.0;
    private double offRoadPenalty = 0.65;
    private double offRoadDrag = 0.94;
    private double driftEaseFactor = 1.0;
    private String surfaceType = "asphalt";

    public TrackPhysicsConfig() {}

    public TrackPhysicsConfig(double gripMultiplier, double accelMultiplier, double brakingMultiplier,
                              double offRoadPenalty, double offRoadDrag, double driftEaseFactor, String surfaceType) {
        this.gripMultiplier = gripMultiplier;
        this.accelMultiplier = accelMultiplier;
        this.brakingMultiplier = brakingMultiplier;
        this.offRoadPenalty = offRoadPenalty;
        this.offRoadDrag = offRoadDrag;
        this.driftEaseFactor = driftEaseFactor;
        this.surfaceType = surfaceType;
    }

    public double getGripMultiplier() { return gripMultiplier; }
    public void setGripMultiplier(double gripMultiplier) { this.gripMultiplier = gripMultiplier; }

    public double getAccelMultiplier() { return accelMultiplier; }
    public void setAccelMultiplier(double accelMultiplier) { this.accelMultiplier = accelMultiplier; }

    public double getBrakingMultiplier() { return brakingMultiplier; }
    public void setBrakingMultiplier(double brakingMultiplier) { this.brakingMultiplier = brakingMultiplier; }

    public double getOffRoadPenalty() { return offRoadPenalty; }
    public void setOffRoadPenalty(double offRoadPenalty) { this.offRoadPenalty = offRoadPenalty; }

    public double getOffRoadDrag() { return offRoadDrag; }
    public void setOffRoadDrag(double offRoadDrag) { this.offRoadDrag = offRoadDrag; }

    public double getDriftEaseFactor() { return driftEaseFactor; }
    public void setDriftEaseFactor(double driftEaseFactor) { this.driftEaseFactor = driftEaseFactor; }

    public String getSurfaceType() { return surfaceType; }
    public void setSurfaceType(String surfaceType) { this.surfaceType = surfaceType; }
}

