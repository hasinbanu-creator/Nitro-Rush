package com.nitrorush.backend.protocol.payload;

public class PlayerInputPayload {

    private String roomId;
    private long sequenceNumber;
    private double throttle;
    private double brake;
    private double steer;
    private boolean drift;
    private boolean nitro;

    public PlayerInputPayload() {}

    public PlayerInputPayload(String roomId, long sequenceNumber, double throttle, double brake,
                              double steer, boolean drift, boolean nitro) {
        this.roomId = roomId;
        this.sequenceNumber = sequenceNumber;
        this.throttle = throttle;
        this.brake = brake;
        this.steer = steer;
        this.drift = drift;
        this.nitro = nitro;
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public long getSequenceNumber() { return sequenceNumber; }
    public void setSequenceNumber(long sequenceNumber) { this.sequenceNumber = sequenceNumber; }

    public double getThrottle() { return throttle; }
    public void setThrottle(double throttle) { this.throttle = throttle; }

    public double getBrake() { return brake; }
    public void setBrake(double brake) { this.brake = brake; }

    public double getSteer() { return steer; }
    public void setSteer(double steer) { this.steer = steer; }

    public boolean isDrift() { return drift; }
    public void setDrift(boolean drift) { this.drift = drift; }

    public boolean isNitro() { return nitro; }
    public void setNitro(boolean nitro) { this.nitro = nitro; }
}

