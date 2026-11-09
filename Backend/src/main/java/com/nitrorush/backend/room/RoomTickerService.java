package com.nitrorush.backend.room;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled background service ticking active multiplayer rooms at 20 TPS (50 ms).
 */
@Component
public class RoomTickerService {

    private static final Logger log = LoggerFactory.getLogger(RoomTickerService.class);

    private final RoomManager roomManager;
    private volatile boolean enabled = true;

    public RoomTickerService(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    @Scheduled(fixedRate = 50)
    public void runTick() {
        if (!enabled) return;

        try {
            roomManager.tick(0.050);
        } catch (Exception e) {
            log.error("Unhandled exception in RoomTickerService: {}", e.getMessage(), e);
        }
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }
}

