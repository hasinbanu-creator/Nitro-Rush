package com.nitrorush.backend.physics.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class HandlingConfig {
    private double driftGripRetention = 0.94;
    private double driftTurnMultiplier = 1.38;
    private double baseLateralGrip = 0.85;
    private double lowSpeedAgility = 0.46;
    private double offRoadTractionBonus = 1.0;

    public HandlingConfig() {}

    public HandlingConfig(double driftGripRetention, double driftTurnMultiplier, double baseLateralGrip, double lowSpeedAgility, double offRoadTractionBonus) {
        this.driftGripRetention = driftGripRetention;
        this.driftTurnMultiplier = driftTurnMultiplier;
        this.baseLateralGrip = baseLateralGrip;
        this.lowSpeedAgility = lowSpeedAgility;
        this.offRoadTractionBonus = offRoadTractionBonus;
    }

    public double getDriftGripRetention() { return driftGripRetention; }
    public void setDriftGripRetention(double driftGripRetention) { this.driftGripRetention = driftGripRetention; }

    public double getDriftTurnMultiplier() { return driftTurnMultiplier; }
    public void setDriftTurnMultiplier(double driftTurnMultiplier) { this.driftTurnMultiplier = driftTurnMultiplier; }

    public double getBaseLateralGrip() { return baseLateralGrip; }
    public void setBaseLateralGrip(double baseLateralGrip) { this.baseLateralGrip = baseLateralGrip; }

    public double getLowSpeedAgility() { return lowSpeedAgility; }
    public void setLowSpeedAgility(double lowSpeedAgility) { this.lowSpeedAgility = lowSpeedAgility; }

    public double getOffRoadTractionBonus() { return offRoadTractionBonus; }
    public void setOffRoadTractionBonus(double offRoadTractionBonus) { this.offRoadTractionBonus = offRoadTractionBonus; }
}

