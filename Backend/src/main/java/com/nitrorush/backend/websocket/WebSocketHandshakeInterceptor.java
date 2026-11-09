package com.nitrorush.backend.websocket;

import com.nitrorush.backend.security.OriginValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * Intercepts WebSocket handshakes to enforce strict Origin security validation
 * and attach client connection metadata to session attributes.
 */
@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(WebSocketHandshakeInterceptor.class);

    public static final String ATTR_CLIENT_IP = "CLIENT_IP";
    public static final String ATTR_HANDSHAKE_TIME = "HANDSHAKE_TIME";
    public static final String ATTR_ORIGIN = "CLIENT_ORIGIN";

    private final OriginValidator originValidator;

    public WebSocketHandshakeInterceptor(OriginValidator originValidator) {
        this.originValidator = originValidator;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        HttpHeaders headers = request.getHeaders();
        String origin = headers.getOrigin();

        if (!originValidator.isAllowed(origin)) {
            log.warn("Blocking unauthorized WebSocket handshake attempt from origin='{}', remote='{}'",
                    origin, request.getRemoteAddress());
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        attributes.put(ATTR_CLIENT_IP, request.getRemoteAddress());
        attributes.put(ATTR_HANDSHAKE_TIME, System.currentTimeMillis());
        attributes.put(ATTR_ORIGIN, origin);

        log.debug("Approved WebSocket handshake from origin='{}', remote='{}'", origin, request.getRemoteAddress());
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.error("Error encountered after WebSocket handshake completion: {}", exception.getMessage());
        }
    }
}

