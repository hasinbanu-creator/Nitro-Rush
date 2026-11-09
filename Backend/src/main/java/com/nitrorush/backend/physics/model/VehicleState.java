package com.nitrorush.backend.physics.model;

/**
 * Mutable/immutable vehicle physics state representation.
 */
public class VehicleState {
    public double x;
    public double y;
    public double vx;
    public double vy;
    public double rotation; // heading in radians

    public double forwardSpeed;
    public double lateralSpeed;
    public int currentSpeedKMH;

    public double nitroAmount = 100.0;
    public boolean isNitroActive = false;

    public boolean isDrifting = false;
    public double driftAngle = 0.0;
    public double driftAngleDeg = 0.0;
    public double driftDuration = 0.0;
    public boolean hasQualifyingSlip = false;

    public boolean isReverseGear = false;
    public double brakeHoldTimer = 0.0;

    public VehicleState() {}

    public VehicleState(double startX, double startY, double startAngle, double initialNitro) {
        this.x = startX;
        this.y = startY;
        this.rotation = startAngle;
        this.nitroAmount = initialNitro;
    }

    public VehicleState(VehicleState other) {
        this.x = other.x;
        this.y = other.y;
        this.vx = other.vx;
        this.vy = other.vy;
        this.rotation = other.rotation;
        this.forwardSpeed = other.forwardSpeed;
        this.lateralSpeed = other.lateralSpeed;
        this.currentSpeedKMH = other.currentSpeedKMH;
        this.nitroAmount = other.nitroAmount;
        this.isNitroActive = other.isNitroActive;
        this.isDrifting = other.isDrifting;
        this.driftAngle = other.driftAngle;
        this.driftAngleDeg = other.driftAngleDeg;
        this.driftDuration = other.driftDuration;
        this.hasQualifyingSlip = other.hasQualifyingSlip;
        this.isReverseGear = other.isReverseGear;
        this.brakeHoldTimer = other.brakeHoldTimer;
    }

    public VehicleState copy() {
        return new VehicleState(this);
    }

    // Getters and Setters
    public double getX() { return x; }
    public void setX(double x) { this.x = x; }

    public double getY() { return y; }
    public void setY(double y) { this.y = y; }

    public double getVx() { return vx; }
    public void setVx(double vx) { this.vx = vx; }

    public double getVy() { return vy; }
    public void setVy(double vy) { this.vy = vy; }

    public double getRotation() { return rotation; }
    public void setRotation(double rotation) { this.rotation = rotation; }

    public double getForwardSpeed() { return forwardSpeed; }
    public void setForwardSpeed(double forwardSpeed) { this.forwardSpeed = forwardSpeed; }

    public double getLateralSpeed() { return lateralSpeed; }
    public void setLateralSpeed(double lateralSpeed) { this.lateralSpeed = lateralSpeed; }

    public int getCurrentSpeedKMH() { return currentSpeedKMH; }
    public void setCurrentSpeedKMH(int currentSpeedKMH) { this.currentSpeedKMH = currentSpeedKMH; }

    public double getNitroAmount() { return nitroAmount; }
    public void setNitroAmount(double nitroAmount) { this.nitroAmount = nitroAmount; }

    public boolean isNitroActive() { return isNitroActive; }
    public void setNitroActive(boolean nitroActive) { isNitroActive = nitroActive; }

    public boolean isDrifting() { return isDrifting; }
    public void setDrifting(boolean drifting) { isDrifting = drifting; }

    public double getDriftAngle() { return driftAngle; }
    public void setDriftAngle(double driftAngle) { this.driftAngle = driftAngle; }

    public double getDriftAngleDeg() { return driftAngleDeg; }
    public void setDriftAngleDeg(double driftAngleDeg) { this.driftAngleDeg = driftAngleDeg; }

    public double getDriftDuration() { return driftDuration; }
    public void setDriftDuration(double driftDuration) { this.driftDuration = driftDuration; }

    public boolean isHasQualifyingSlip() { return hasQualifyingSlip; }
    public void setHasQualifyingSlip(boolean hasQualifyingSlip) { this.hasQualifyingSlip = hasQualifyingSlip; }

    public boolean isReverseGear() { return isReverseGear; }
    public void setReverseGear(boolean reverseGear) { isReverseGear = reverseGear; }

    public double getBrakeHoldTimer() { return brakeHoldTimer; }
    public void setBrakeHoldTimer(double brakeHoldTimer) { this.brakeHoldTimer = brakeHoldTimer; }
}

