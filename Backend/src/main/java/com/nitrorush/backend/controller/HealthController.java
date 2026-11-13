package com.nitrorush.backend.controller;

import com.nitrorush.backend.matchmaking.MatchmakingService;
import com.nitrorush.backend.room.RoomManager;
import com.nitrorush.backend.websocket.ConnectionManager;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.util.Map;

/**
 * Production Health & Readiness Controller.
 * Provides HTTP endpoints (/health and /api/health) for cloud monitoring,
 * load balancer health checks, and container orchestrator probes.
 */
@RestController
public class HealthController {

    private final RoomManager roomManager;
    private final MatchmakingService matchmakingService;
    private final ConnectionManager connectionManager;

    public HealthController(RoomManager roomManager,
                            MatchmakingService matchmakingService,
                            ConnectionManager connectionManager) {
        this.roomManager = roomManager;
        this.matchmakingService = matchmakingService;
        this.connectionManager = connectionManager;
    }

    @GetMapping({"/health", "/api/health"})
    public ResponseEntity<Map<String, Object>> health() {
        long uptimeMs = ManagementFactory.getRuntimeMXBean().getUptime();
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "nitro-rush-backend",
                "version", "0.0.1-SNAPSHOT",
                "uptimeSeconds", uptimeMs / 1000,
                "activeRooms", roomManager.getActiveRoomCount(),
                "queuedPlayers", matchmakingService.getQueueSize(),
                "activeConnections", connectionManager.getConnectionCount()
        ));
    }
}

