package com.nitrorush.backend.physics.track;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TrackCheckpoint {
    private int index;
    private double x;
    private double y;
    private double angle;
    private double width;

    public TrackCheckpoint() {}

    public TrackCheckpoint(int index, double x, double y, double angle, double width) {
        this.index = index;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.width = width;
    }

    public int getIndex() { return index; }
    public void setIndex(int index) { this.index = index; }

    public double getX() { return x; }
    public void setX(double x) { this.x = x; }

    public double getY() { return y; }
    public void setY(double y) { this.y = y; }

    public double getAngle() { return angle; }
    public void setAngle(double angle) { this.angle = angle; }

    public double getWidth() { return width; }
    public void setWidth(double width) { this.width = width; }
}

