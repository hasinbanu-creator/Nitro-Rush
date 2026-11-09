package com.nitrorush.backend.physics.config;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class VehicleConfig {
    private String id;
    private String name;
    private String vehicleClass;
    private String tagline;
    private String description;
    private VehicleStats stats = new VehicleStats();
    private NitroConfig nitroConfig = new NitroConfig();
    private HandlingConfig handlingConfig = new HandlingConfig();
    private double massKg = 1250.0;

    public VehicleConfig() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getVehicleClass() { return vehicleClass; }
    public void setVehicleClass(String vehicleClass) { this.vehicleClass = vehicleClass; }

    public String getTagline() { return tagline; }
    public void setTagline(String tagline) { this.tagline = tagline; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public VehicleStats getStats() { return stats; }
    public void setStats(VehicleStats stats) { this.stats = stats; }

    public NitroConfig getNitroConfig() { return nitroConfig; }
    public void setNitroConfig(NitroConfig nitroConfig) { this.nitroConfig = nitroConfig; }

    public HandlingConfig getHandlingConfig() { return handlingConfig; }
    public void setHandlingConfig(HandlingConfig handlingConfig) { this.handlingConfig = handlingConfig; }

    public double getMassKg() { return massKg; }
    public void setMassKg(double massKg) { this.massKg = massKg; }
}

