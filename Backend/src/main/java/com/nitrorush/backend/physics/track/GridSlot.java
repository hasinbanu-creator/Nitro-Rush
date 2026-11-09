package com.nitrorush.backend.physics.track;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class GridSlot {
    private String slot;
    private double x;
    private double y;
    private double angle;

    public GridSlot() {}

    public GridSlot(String slot, double x, double y, double angle) {
        this.slot = slot;
        this.x = x;
        this.y = y;
        this.angle = angle;
    }

    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }

    public double getX() { return x; }
    public void setX(double x) { this.x = x; }

    public double getY() { return y; }
    public void setY(double y) { this.y = y; }

    public double getAngle() { return angle; }
    public void setAngle(double angle) { this.angle = angle; }
}

