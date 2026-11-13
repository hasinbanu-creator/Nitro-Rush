package com.nitrorush.backend.controller;

import com.nitrorush.backend.matchmaking.MatchmakingService;
import com.nitrorush.backend.room.RoomManager;
import com.nitrorush.backend.websocket.ConnectionManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

class HealthControllerTest {

    @Test
    @DisplayName("Health endpoint returns HTTP 200 with UP status and valid metrics")
    void testHealthEndpointReturnsUp() {
        RoomManager roomManager = Mockito.mock(RoomManager.class);
        MatchmakingService matchmakingService = Mockito.mock(MatchmakingService.class);
        ConnectionManager connectionManager = Mockito.mock(ConnectionManager.class);

        when(roomManager.getActiveRoomCount()).thenReturn(3);
        when(matchmakingService.getQueueSize()).thenReturn(2);
        when(connectionManager.getConnectionCount()).thenReturn(5);

        HealthController controller = new HealthController(roomManager, matchmakingService, connectionManager);
        ResponseEntity<Map<String, Object>> response = controller.health();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());

        Map<String, Object> body = response.getBody();
        assertEquals("UP", body.get("status"));
        assertEquals("nitro-rush-backend", body.get("service"));
        assertEquals(3, body.get("activeRooms"));
        assertEquals(2, body.get("queuedPlayers"));
        assertEquals(5, body.get("activeConnections"));
        assertTrue(((Number) body.get("uptimeSeconds")).longValue() >= 0);
    }
}

