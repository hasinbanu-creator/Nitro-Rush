package com.nitrorush.backend.physics.collision;

import com.nitrorush.backend.physics.config.PhysicsConstants;
import com.nitrorush.backend.physics.model.VehicleState;

import java.util.List;

/**
 * Authoritative 2-pass arcade vehicle collision resolver matching RaceScene.ts.
 */
public class CollisionEngine {

    public static class CollisionProxy {
        public String id;
        public VehicleState state;
        public double massKg;

        public CollisionProxy(String id, VehicleState state, double massKg) {
            this.id = id;
            this.state = state;
            this.massKg = massKg;
        }

        public void deflectRotation(double delta) {
            this.state.rotation += delta;
        }
    }

    /**
     * Resolves pairwise collisions across all active vehicles in place.
     *
     * @param proxies List of vehicle collision proxies (state + mass)
     * @return Number of colliding pairs detected and resolved
     */
    public int resolveCollisions(List<CollisionProxy> proxies) {
        if (proxies == null || proxies.size() < 2) {
            return 0;
        }

        final double minDistance = PhysicsConstants.COLLISION_MIN_DISTANCE;
        final double minDistanceSq = PhysicsConstants.COLLISION_MIN_DISTANCE_SQ;
        int collisionsDetected = 0;

        // =========================================================================
        // PASS 1: Primary Overlap Separation + Momentum & Tangential Impulse Exchange
        // =========================================================================
        final int n = proxies.size();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                CollisionProxy vA = proxies.get(i);
                CollisionProxy vB = proxies.get(j);

                double dx = vB.state.x - vA.state.x;
                double dy = vB.state.y - vA.state.y;
                double distSq = dx * dx + dy * dy;

                if (distSq < minDistanceSq && distSq > 0.001) {
                    collisionsDetected++;
                    double dist = Math.sqrt(distSq);
                    double overlap = minDistance - dist;

                    double nx = dx / dist;
                    double ny = dy / dist;

                    double mA = vA.massKg;
                    double mB = vB.massKg;
                    double totalMass = mA + mB;
                    double wA = mB / totalMass;
                    double wB = mA / totalMass;

                    // 1. Position Separation: Displace inversely proportional to mass
                    double sep = overlap * 1.02;
                    vA.state.x -= nx * sep * wA;
                    vA.state.y -= ny * sep * wA;
                    vB.state.x += nx * sep * wB;
                    vB.state.y += ny * sep * wB;

                    // 2. Relative Velocity along Collision Normal
                    double relVx = vB.state.vx - vA.state.vx;
                    double relVy = vB.state.vy - vA.state.vy;
                    double velAlongNormal = relVx * nx + relVy * ny;

                    if (velAlongNormal < 0) {
                        // Speed-adaptive restitution: crisp at low speed (0.35), firm & controlled at high speeds (0.20)
                        double restitution = Math.max(0.20, 0.35 - Math.abs(velAlongNormal) * 0.00012);
                        double impulseScalar = -(1.0 + restitution) * velAlongNormal;

                        // Adaptive impulse cap eliminates high-speed chatter without runaway forces
                        double maxImpulse = Math.max(420.0, Math.abs(velAlongNormal) * 1.25);
                        impulseScalar = Math.min(impulseScalar, maxImpulse);

                        // Apply normal impulse
                        vA.state.vx -= nx * impulseScalar * wA;
                        vA.state.vy -= ny * impulseScalar * wA;
                        vB.state.vx += nx * impulseScalar * wB;
                        vB.state.vy += ny * impulseScalar * wB;

                        // 3. Tangential Linear Friction (Sideswipe scrub and momentum exchange)
                        double tangentX = -ny;
                        double tangentY = nx;
                        double velAlongTangent = relVx * tangentX + relVy * tangentY;

                        // Coulomb friction bounded by normal impulse and relative slip speed
                        double frictionCoeff = 0.18;
                        double maxFriction = impulseScalar * frictionCoeff;
                        double frictionMagnitude = Math.min(Math.abs(velAlongTangent) * 0.35, maxFriction);
                        double frictionScalar = -Math.signum(velAlongTangent) * frictionMagnitude;

                        vA.state.vx -= tangentX * frictionScalar * wA;
                        vA.state.vy -= tangentY * frictionScalar * wA;
                        vB.state.vx += tangentX * frictionScalar * wB;
                        vB.state.vy += tangentY * frictionScalar * wB;

                        // Contact kinetic scrub (mild kinetic energy loss from metal grinding)
                        double scrubDamping = Math.min(0.035, (impulseScalar / 1000.0) * 0.02);
                        if (scrubDamping > 0.001) {
                            vA.state.vx -= vA.state.vx * scrubDamping * wA;
                            vA.state.vy -= vA.state.vy * scrubDamping * wA;
                            vB.state.vx -= vB.state.vx * scrubDamping * wB;
                            vB.state.vy -= vB.state.vy * scrubDamping * wB;
                        }

                        // 4. Angular Rotational Deflection
                        double lateralA = (vA.state.vx * tangentX + vA.state.vy * tangentY) * 0.0006;
                        vA.deflectRotation(lateralA * wA * 2.0);
                        vB.deflectRotation(-lateralA * wB * 2.0);
                    }
                }
            }
        }

        // =========================================================================
        // PASS 2: Positional Relaxation Solver (Resolves Secondary Overlaps)
        // NOTE: Does NOT re-apply velocity impulses to prevent double-kicks or jitter
        // =========================================================================
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                CollisionProxy vA = proxies.get(i);
                CollisionProxy vB = proxies.get(j);

                double dx = vB.state.x - vA.state.x;
                double dy = vB.state.y - vA.state.y;
                double distSq = dx * dx + dy * dy;

                if (distSq < minDistanceSq && distSq > 0.001) {
                    double dist = Math.sqrt(distSq);
                    double overlap = minDistance - dist;

                    double nx = dx / dist;
                    double ny = dy / dist;

                    double mA = vA.massKg;
                    double mB = vB.massKg;
                    double totalMass = mA + mB;
                    double wA = mB / totalMass;
                    double wB = mA / totalMass;

                    // Resolve remaining overlap cleanly
                    double sep = overlap * 1.02;
                    vA.state.x -= nx * sep * wA;
                    vA.state.y -= ny * sep * wA;
                    vB.state.x += nx * sep * wB;
                    vB.state.y += ny * sep * wB;
                }
            }
        }

        return collisionsDetected;
    }
}

