package com.nitrorush.backend.physics.model;

import java.util.Objects;

/**
 * High-performance 2D double-precision vector for physics calculations.
 */
public final class Vector2D {
    public final double x;
    public final double y;

    public static final Vector2D ZERO = new Vector2D(0.0, 0.0);

    public Vector2D(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public static Vector2D of(double x, double y) {
        return new Vector2D(x, y);
    }

    public Vector2D add(Vector2D other) {
        return new Vector2D(this.x + other.x, this.y + other.y);
    }

    public Vector2D add(double dx, double dy) {
        return new Vector2D(this.x + dx, this.y + dy);
    }

    public Vector2D subtract(Vector2D other) {
        return new Vector2D(this.x - other.x, this.y - other.y);
    }

    public Vector2D multiply(double scalar) {
        return new Vector2D(this.x * scalar, this.y * scalar);
    }

    public double dot(Vector2D other) {
        return this.x * other.x + this.y * other.y;
    }

    public double lengthSq() {
        return this.x * this.x + this.y * this.y;
    }

    public double length() {
        return Math.sqrt(lengthSq());
    }

    public double distanceSq(Vector2D other) {
        double dx = this.x - other.x;
        double dy = this.y - other.y;
        return dx * dx + dy * dy;
    }

    public double distance(Vector2D other) {
        return Math.sqrt(distanceSq(other));
    }

    public Vector2D normalize() {
        double len = length();
        if (len < 1e-9) {
            return ZERO;
        }
        return new Vector2D(this.x / len, this.y / len);
    }

    public double angle() {
        return Math.atan2(this.y, this.x);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Vector2D vector2D = (Vector2D) o;
        return Double.compare(vector2D.x, x) == 0 && Double.compare(vector2D.y, y) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y);
    }

    @Override
    public String toString() {
        return String.format("(%.4f, %.4f)", x, y);
    }
}

