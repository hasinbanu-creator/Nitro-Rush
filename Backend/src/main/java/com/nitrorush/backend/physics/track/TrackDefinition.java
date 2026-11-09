package com.nitrorush.backend.physics.track;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.nitrorush.backend.physics.config.TrackPhysicsConfig;

import java.util.ArrayList;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TrackDefinition {
    private String id;
    private String name;
    private String environment;
    private String difficulty;
    private int laps = 3;
    private double worldWidth = 3200.0;
    private double worldHeight = 2400.0;
    private double roadWidth = 140.0;
    private TrackPhysicsConfig physics = new TrackPhysicsConfig();
    private List<TrackWaypoint> waypoints = new ArrayList<>();
    private List<TrackCheckpoint> checkpoints = new ArrayList<>();
    private List<GridSlot> startGridPositions = new ArrayList<>();
    private List<TrackWaypoint> spacedPoints = new ArrayList<>();

    public TrackDefinition() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public int getLaps() { return laps; }
    public void setLaps(int laps) { this.laps = laps; }

    public double getWorldWidth() { return worldWidth; }
    public void setWorldWidth(double worldWidth) { this.worldWidth = worldWidth; }

    public double getWorldHeight() { return worldHeight; }
    public void setWorldHeight(double worldHeight) { this.worldHeight = worldHeight; }

    public double getRoadWidth() { return roadWidth; }
    public void setRoadWidth(double roadWidth) { this.roadWidth = roadWidth; }

    public TrackPhysicsConfig getPhysics() { return physics; }
    public void setPhysics(TrackPhysicsConfig physics) { this.physics = physics; }

    public List<TrackWaypoint> getWaypoints() { return waypoints; }
    public void setWaypoints(List<TrackWaypoint> waypoints) { this.waypoints = waypoints; }

    public List<TrackCheckpoint> getCheckpoints() { return checkpoints; }
    public void setCheckpoints(List<TrackCheckpoint> checkpoints) { this.checkpoints = checkpoints; }

    public List<GridSlot> getStartGridPositions() { return startGridPositions; }
    public void setStartGridPositions(List<GridSlot> startGridPositions) { this.startGridPositions = startGridPositions; }

    public List<TrackWaypoint> getSpacedPoints() { return spacedPoints; }
    public void setSpacedPoints(List<TrackWaypoint> spacedPoints) { this.spacedPoints = spacedPoints; }
}

