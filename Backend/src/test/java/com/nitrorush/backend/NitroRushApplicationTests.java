package com.nitrorush.backend;

import com.nitrorush.backend.config.NitroRushProperties;
import com.nitrorush.backend.security.OriginValidator;
import com.nitrorush.backend.session.GuestSessionManager;
import com.nitrorush.backend.websocket.ConnectionManager;
import com.nitrorush.backend.websocket.GameWebSocketHandler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class NitroRushApplicationTests {

    @Autowired
    private NitroRushProperties properties;

    @Autowired
    private ConnectionManager connectionManager;

    @Autowired
    private GuestSessionManager guestSessionManager;

    @Autowired
    private OriginValidator originValidator;

    @Autowired
    private GameWebSocketHandler gameWebSocketHandler;

    @Test
    @DisplayName("Application context starts successfully with all core multiplayer beans")
    void contextLoads() {
        assertThat(properties).isNotNull();
        assertThat(connectionManager).isNotNull();
        assertThat(guestSessionManager).isNotNull();
        assertThat(originValidator).isNotNull();
        assertThat(gameWebSocketHandler).isNotNull();

        assertThat(properties.getWebsocket().getPath()).isEqualTo("/ws/game");
        assertThat(properties.getWebsocket().getHeartbeatIntervalMs()).isEqualTo(10000L);
    }
}

