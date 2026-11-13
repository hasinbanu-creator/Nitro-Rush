package com.nitrorush.backend.room;

import com.nitrorush.backend.common.TimeProvider;
import com.nitrorush.backend.matchmaking.MatchmakingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled background service ticking active multiplayer rooms and matchmaking queue at 20 TPS (50 ms).
 */
@Component
public class RoomTickerService {

    private static final Logger log = LoggerFactory.getLogger(RoomTickerService.class);

    private final RoomManager roomManager;
    private final MatchmakingService matchmakingService;
    private final TimeProvider timeProvider;
    private volatile boolean enabled = true;

    public RoomTickerService(RoomManager roomManager, MatchmakingService matchmakingService, TimeProvider timeProvider) {
        this.roomManager = roomManager;
        this.matchmakingService = matchmakingService;
        this.timeProvider = timeProvider;
    }

    @Scheduled(fixedRate = 50)
    public void runTick() {
        if (!enabled) return;

        try {
            long now = timeProvider.currentTimeMillis();
            matchmakingService.tick(now);
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
