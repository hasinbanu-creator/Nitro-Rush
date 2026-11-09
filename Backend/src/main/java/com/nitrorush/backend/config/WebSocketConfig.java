package com.nitrorush.backend.config;

import com.nitrorush.backend.websocket.GameWebSocketHandler;
import com.nitrorush.backend.websocket.WebSocketHandshakeInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistration;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.List;

/**
 * Spring WebSocket Configuration registering the raw /ws/game endpoint,
 * handshake interceptor, and origin filter rules.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final GameWebSocketHandler gameWebSocketHandler;
    private final WebSocketHandshakeInterceptor handshakeInterceptor;
    private final NitroRushProperties properties;

    public WebSocketConfig(GameWebSocketHandler gameWebSocketHandler,
                           WebSocketHandshakeInterceptor handshakeInterceptor,
                           NitroRushProperties properties) {
        this.gameWebSocketHandler = gameWebSocketHandler;
        this.handshakeInterceptor = handshakeInterceptor;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String path = properties.getWebsocket().getPath();
        List<String> allowedOrigins = properties.getWebsocket().getAllowedOrigins();

        WebSocketHandlerRegistration registration = registry.addHandler(gameWebSocketHandler, path)
                .addInterceptors(handshakeInterceptor);

        if (allowedOrigins != null && !allowedOrigins.isEmpty()) {
            registration.setAllowedOrigins(allowedOrigins.toArray(new String[0]));
        } else {
            registration.setAllowedOrigins("http://localhost:5173", "http://127.0.0.1:5173");
        }
    }
}

