package com.nitrorush.backend.protocol.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class VehicleTelemetry {

    private String id;
    private double x;
    private double y;
    private double vx;
    private double vy;
    private double rot;
    private int speedKMH;
    private int lap;
    private int nextCp;
    private int nitro;

    @JsonProperty("isDrifting")
    private boolean drifting;

    private int pos;
    private String status;

    public VehicleTelemetry() {}

    public VehicleTelemetry(String id, double x, double y, double vx, double vy, double rot,
                            int speedKMH, int lap, int nextCp, int nitro, boolean drifting,
                            int pos, String status) {
        this.id = id;
        this.x = Math.round(x * 100.0) / 100.0;
        this.y = Math.round(y * 100.0) / 100.0;
        this.vx = Math.round(vx * 100.0) / 100.0;
        this.vy = Math.round(vy * 100.0) / 100.0;
        this.rot = Math.round(rot * 1000.0) / 1000.0;
        this.speedKMH = speedKMH;
        this.lap = lap;
        this.nextCp = nextCp;
        this.nitro = nitro;
        this.drifting = drifting;
        this.pos = pos;
        this.status = status;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public double getX() { return x; }
    public void setX(double x) { this.x = x; }

    public double getY() { return y; }
    public void setY(double y) { this.y = y; }

    public double getVx() { return vx; }
    public void setVx(double vx) { this.vx = vx; }

    public double getVy() { return vy; }
    public void setVy(double vy) { this.vy = vy; }

    public double getRot() { return rot; }
    public void setRot(double rot) { this.rot = rot; }

    public int getSpeedKMH() { return speedKMH; }
    public void setSpeedKMH(int speedKMH) { this.speedKMH = speedKMH; }

    public int getLap() { return lap; }
    public void setLap(int lap) { this.lap = lap; }

    public int getNextCp() { return nextCp; }
    public void setNextCp(int nextCp) { this.nextCp = nextCp; }

    public int getNitro() { return nitro; }
    public void setNitro(int nitro) { this.nitro = nitro; }

    @JsonProperty("isDrifting")
    public boolean isDrifting() { return drifting; }

    @JsonProperty("isDrifting")
    public void setDrifting(boolean drifting) { this.drifting = drifting; }

    public int getPos() { return pos; }
    public void setPos(int pos) { this.pos = pos; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}

