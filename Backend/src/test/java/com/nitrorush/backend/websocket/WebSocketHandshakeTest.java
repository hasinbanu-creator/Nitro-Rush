package com.nitrorush.backend.websocket;

import com.nitrorush.backend.config.NitroRushProperties;
import com.nitrorush.backend.security.OriginValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.net.InetSocketAddress;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class WebSocketHandshakeTest {

    private OriginValidator originValidator;
    private WebSocketHandshakeInterceptor interceptor;

    @BeforeEach
    void setUp() {
        NitroRushProperties properties = new NitroRushProperties();
        originValidator = new OriginValidator(properties);
        interceptor = new WebSocketHandshakeInterceptor(originValidator);
    }

    private ServerHttpRequest mockRequest(String origin) {
        ServerHttpRequest request = mock(ServerHttpRequest.class);
        HttpHeaders headers = new HttpHeaders();
        if (origin != null) {
            headers.set(HttpHeaders.ORIGIN, origin);
        }
        when(request.getHeaders()).thenReturn(headers);
        when(request.getRemoteAddress()).thenReturn(new InetSocketAddress("127.0.0.1", 51234));
        when(request.getURI()).thenReturn(URI.create("http://localhost:8080/ws/game"));
        return request;
    }

    @Test
    @DisplayName("Handshake with approved origin succeeds and attaches session attributes")
    void testApprovedOriginHandshake() {
        ServerHttpRequest request = mockRequest("http://localhost:5173");
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        WebSocketHandler handler = mock(WebSocketHandler.class);
        Map<String, Object> attributes = new HashMap<>();

        boolean result = interceptor.beforeHandshake(request, response, handler, attributes);

        assertThat(result).isTrue();
        assertThat(attributes).containsKey(WebSocketHandshakeInterceptor.ATTR_CLIENT_IP);
        assertThat(attributes).containsKey(WebSocketHandshakeInterceptor.ATTR_HANDSHAKE_TIME);
        assertThat(attributes.get(WebSocketHandshakeInterceptor.ATTR_ORIGIN)).isEqualTo("http://localhost:5173");
        verify(response, never()).setStatusCode(any());
    }

    @Test
    @DisplayName("Handshake with alternative approved local origin succeeds")
    void testAlternativeApprovedOrigin() {
        ServerHttpRequest request = mockRequest("http://127.0.0.1:5173/");
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        WebSocketHandler handler = mock(WebSocketHandler.class);
        Map<String, Object> attributes = new HashMap<>();

        boolean result = interceptor.beforeHandshake(request, response, handler, attributes);

        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("Handshake with unapproved origin is rejected with HTTP 403 Forbidden")
    void testUnapprovedOriginRejected() {
        ServerHttpRequest request = mockRequest("http://evil-hacker.site");
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        WebSocketHandler handler = mock(WebSocketHandler.class);
        Map<String, Object> attributes = new HashMap<>();

        boolean result = interceptor.beforeHandshake(request, response, handler, attributes);

        assertThat(result).isFalse();
        verify(response).setStatusCode(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("Handshake with missing or null origin header is rejected with HTTP 403 Forbidden")
    void testMissingOriginRejected() {
        ServerHttpRequest request = mockRequest(null);
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        WebSocketHandler handler = mock(WebSocketHandler.class);
        Map<String, Object> attributes = new HashMap<>();

        boolean result = interceptor.beforeHandshake(request, response, handler, attributes);

        assertThat(result).isFalse();
        verify(response).setStatusCode(HttpStatus.FORBIDDEN);
    }
}

