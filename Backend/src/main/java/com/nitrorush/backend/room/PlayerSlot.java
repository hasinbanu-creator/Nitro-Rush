package com.nitrorush.backend.room;

import com.nitrorush.backend.physics.model.PlayerInput;
import com.nitrorush.backend.protocol.payload.PlayerSlotInfo;

/**
 * Encapsulates an assigned player slot inside a multiplayer room.
 */
public class PlayerSlot {

    private final String playerId;
    private final String guestToken;
    private final String displayName;
    private final String slotId;
    private final int slotIndex;

    private volatile String carId = "bolt-gt";
    private volatile boolean ready = false;
    private volatile boolean connected = true;
    private volatile String sessionId;
    private volatile long disconnectedAt = 0;
    private volatile long reconnectDeadlineMs = 0;
    private volatile boolean reconnectExpired = false;
    private volatile long lastAckInputSeq = 0;
    private volatile PlayerInput latestInput = PlayerInput.neutral();

    public PlayerSlot(String playerId, String guestToken, String displayName, String slotId, int slotIndex, String initialCarId, String sessionId) {
        this.playerId = playerId;
        this.guestToken = guestToken;
        this.displayName = displayName;
        this.slotId = slotId;
        this.slotIndex = slotIndex;
        if (initialCarId != null && !initialCarId.isBlank()) {
            this.carId = initialCarId;
        }
        this.sessionId = sessionId;
    }

    public String getPlayerId() { return playerId; }
    public String getGuestToken() { return guestToken; }
    public String getDisplayName() { return displayName; }
    public String getSlotId() { return slotId; }
    public int getSlotIndex() { return slotIndex; }

    public String getCarId() { return carId; }
    public void setCarId(String carId) { this.carId = carId; }

    public boolean isReady() { return ready; }
    public void setReady(boolean ready) { this.ready = ready; }

    public boolean isConnected() { return connected; }
    public void setConnected(boolean connected) { this.connected = connected; }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public long getDisconnectedAt() { return disconnectedAt; }
    public void setDisconnectedAt(long disconnectedAt) { this.disconnectedAt = disconnectedAt; }

    public long getReconnectDeadlineMs() { return reconnectDeadlineMs; }
    public void setReconnectDeadlineMs(long reconnectDeadlineMs) { this.reconnectDeadlineMs = reconnectDeadlineMs; }

    public boolean isReconnectExpired() { return reconnectExpired; }
    public void setReconnectExpired(boolean reconnectExpired) { this.reconnectExpired = reconnectExpired; }

    public long getLastAckInputSeq() { return lastAckInputSeq; }
    public void setLastAckInputSeq(long lastAckInputSeq) { this.lastAckInputSeq = lastAckInputSeq; }

    public PlayerInput getLatestInput() { return latestInput; }
    public void setLatestInput(PlayerInput latestInput) { this.latestInput = latestInput; }

    public PlayerSlotInfo toSlotInfo() {
        return new PlayerSlotInfo(playerId, displayName, carId, slotId, ready);
    }
}
