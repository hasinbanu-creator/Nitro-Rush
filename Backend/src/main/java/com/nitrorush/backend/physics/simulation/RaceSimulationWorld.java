package com.nitrorush.backend.physics.simulation;

import com.nitrorush.backend.physics.collision.CollisionEngine;
import com.nitrorush.backend.physics.config.PhysicsConstants;
import com.nitrorush.backend.physics.config.VehicleConfig;
import com.nitrorush.backend.physics.engine.PhysicsEngine;
import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.physics.model.VehicleState;
import com.nitrorush.backend.physics.track.TrackDefinition;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Authoritative headless multi-vehicle race simulation world.
 * Simulates up to 8 vehicles on a designated track circuit at 20 TPS.
 */
public class RaceSimulationWorld {

    public static class VehicleSlot {
        private final String vehicleId;
        private final VehicleConfig config;
        private final VehicleState state;
        private volatile PlayerInput currentInput = PlayerInput.neutral();
        private volatile boolean onTrack = true;
        private volatile boolean controlsLocked = false;

        public VehicleSlot(String vehicleId, VehicleConfig config, VehicleState state) {
            this.vehicleId = vehicleId;
            this.config = config;
            this.state = state;
        }

        public String getVehicleId() { return vehicleId; }
        public VehicleConfig getConfig() { return config; }
        public VehicleState getState() { return state; }
        public PlayerInput getCurrentInput() { return currentInput; }
        public void setCurrentInput(PlayerInput currentInput) { this.currentInput = currentInput; }
        public boolean isOnTrack() { return onTrack; }
        public void setOnTrack(boolean onTrack) { this.onTrack = onTrack; }
        public boolean isControlsLocked() { return controlsLocked; }
        public void setControlsLocked(boolean controlsLocked) { this.controlsLocked = controlsLocked; }
    }

    private final TrackDefinition track;
    private final String difficulty;
    private final PhysicsEngine physicsEngine = new PhysicsEngine();
    private final CollisionEngine collisionEngine = new CollisionEngine();
    private final Map<String, VehicleSlot> vehicles = new LinkedHashMap<>();
    private long tick = 0;

    public RaceSimulationWorld(TrackDefinition track, String difficulty) {
        this.track = Objects.requireNonNull(track, "track definition must not be null");
        this.difficulty = difficulty != null ? difficulty : "MEDIUM";
    }

    public synchronized void addVehicle(String vehicleId, VehicleConfig config, VehicleState initialState) {
        if (vehicles.size() >= 8) {
            throw new IllegalStateException("Maximum 8 vehicles allowed in race simulation");
        }
        vehicles.put(vehicleId, new VehicleSlot(vehicleId, config, initialState));
    }

    public synchronized void removeVehicle(String vehicleId) {
        vehicles.remove(vehicleId);
    }

    public synchronized void updateInput(String vehicleId, PlayerInput input) {
        VehicleSlot slot = vehicles.get(vehicleId);
        if (slot != null && input != null) {
            slot.setCurrentInput(input);
        }
    }

    public synchronized VehicleSlot getVehicleSlot(String vehicleId) {
        return vehicles.get(vehicleId);
    }

    public synchronized int getVehicleCount() {
        return vehicles.size();
    }

    public synchronized long getTick() {
        return tick;
    }

    /**
     * Advances the world by one authoritative fixed timestep (50 ms).
     */
    public synchronized void step() {
        step(PhysicsConstants.FIXED_TIMESTEP);
    }

    /**
     * Advances the world by specified dt.
     */
    public synchronized void step(double dt) {
        tick++;

        // 1. Individual Vehicle Physics
        for (VehicleSlot slot : vehicles.values()) {
            physicsEngine.update(
                    slot.getState(),
                    slot.getCurrentInput(),
                    slot.isControlsLocked(),
                    slot.isOnTrack(),
                    track.getWorldWidth(),
                    track.getWorldHeight(),
                    track.getPhysics(),
                    dt,
                    slot.getConfig(),
                    difficulty,
                    null
            );
        }

        // 2. Multi-car Pairwise Collisions
        if (vehicles.size() > 1) {
            List<CollisionEngine.CollisionProxy> proxies = new ArrayList<>(vehicles.size());
            for (VehicleSlot slot : vehicles.values()) {
                proxies.add(new CollisionEngine.CollisionProxy(
                        slot.getVehicleId(),
                        slot.getState(),
                        slot.getConfig().getMassKg() > 0 ? slot.getConfig().getMassKg() : PhysicsConstants.REFERENCE_MASS_KG
                ));
            }
            collisionEngine.resolveCollisions(proxies);
        }
    }

    public synchronized Map<String, VehicleState> getSnapshot() {
        Map<String, VehicleState> snapshot = new LinkedHashMap<>();
        for (Map.Entry<String, VehicleSlot> entry : vehicles.entrySet()) {
            snapshot.put(entry.getKey(), entry.getValue().getState().copy());
        }
        return Collections.unmodifiableMap(snapshot);
    }
}

