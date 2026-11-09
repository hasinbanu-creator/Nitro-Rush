package com.nitrorush.backend.protocol.payload;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class RaceStatePayload {

    private long serverTick;
    private long serverTimeMs;
    private Map<String, Long> ackInputSeq = new LinkedHashMap<>();
    private List<VehicleTelemetry> vehicles = new ArrayList<>();

    public RaceStatePayload() {}

    public RaceStatePayload(long serverTick, long serverTimeMs, Map<String, Long> ackInputSeq, List<VehicleTelemetry> vehicles) {
        this.serverTick = serverTick;
        this.serverTimeMs = serverTimeMs;
        this.ackInputSeq = ackInputSeq != null ? ackInputSeq : new LinkedHashMap<>();
        this.vehicles = vehicles != null ? vehicles : new ArrayList<>();
    }

    public long getServerTick() { return serverTick; }
    public void setServerTick(long serverTick) { this.serverTick = serverTick; }

    public long getServerTimeMs() { return serverTimeMs; }
    public void setServerTimeMs(long serverTimeMs) { this.serverTimeMs = serverTimeMs; }

    public Map<String, Long> getAckInputSeq() { return ackInputSeq; }
    public void setAckInputSeq(Map<String, Long> ackInputSeq) { this.ackInputSeq = ackInputSeq; }

    public List<VehicleTelemetry> getVehicles() { return vehicles; }
    public void setVehicles(List<VehicleTelemetry> vehicles) { this.vehicles = vehicles; }
}

