package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.protocol.ErrorCode;
import com.nitrorush.backend.protocol.MessageEnvelope;
import com.nitrorush.backend.protocol.MessageType;
import com.nitrorush.backend.protocol.payload.PingPayload;
import com.nitrorush.backend.session.PlayerConnection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ConnectionManagerTest {

    private ConnectionManager connectionManager;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        connectionManager = new ConnectionManager(objectMapper);
    }

    private WebSocketSession mockSession(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        when(session.getRemoteAddress()).thenReturn(new InetSocketAddress("127.0.0.1", 54321));
        return session;
    }

    @Test
    @DisplayName("Connection registration and removal tracks session state safely")
    void testRegisterAndRemove() {
        WebSocketSession session1 = mockSession("sess-1");
        PlayerConnection conn1 = connectionManager.register(session1);

        assertThat(conn1).isNotNull();
        assertThat(conn1.getSessionId()).isEqualTo("sess-1");
        assertThat(connectionManager.getConnectionCount()).isEqualTo(1);
        assertThat(connectionManager.getConnection("sess-1")).isPresent();

        Optional<PlayerConnection> removed = connectionManager.remove("sess-1");
        assertThat(removed).isPresent();
        assertThat(connectionManager.getConnectionCount()).isEqualTo(0);
        assertThat(connectionManager.getConnection("sess-1")).isEmpty();
    }

    @Test
    @DisplayName("Duplicate connection registration does not corrupt tracking")
    void testDuplicateRegistration() {
        WebSocketSession session = mockSession("duplicate-id");
        PlayerConnection first = connectionManager.register(session);
        PlayerConnection second = connectionManager.register(session);

        assertThat(first).isSameAs(second);
        assertThat(connectionManager.getConnectionCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("Binding guest token associates token with connection and supports bi-directional lookup")
    void testGuestTokenBinding() {
        WebSocketSession session = mockSession("sess-bind");
        connectionManager.register(session);

        String guestToken = "token-abc-123";
        boolean bound = connectionManager.bindGuestToken("sess-bind", guestToken);

        assertThat(bound).isTrue();
        assertThat(connectionManager.getConnectionByGuestToken(guestToken)).isPresent();
        assertThat(connectionManager.getConnectionByGuestToken(guestToken).get().getSessionId()).isEqualTo("sess-bind");

        // Removing connection unbinds the token
        connectionManager.remove("sess-bind");
        assertThat(connectionManager.getConnectionByGuestToken(guestToken)).isEmpty();
    }

    @Test
    @DisplayName("Sending protocol messages serializes JSON and transmits via WebSocketSession")
    void testSendMessage() throws IOException {
        WebSocketSession session = mockSession("sess-send");
        connectionManager.register(session);

        MessageEnvelope<PingPayload> ping = MessageEnvelope.of(MessageType.PING, new PingPayload(123456789L));
        boolean sent = connectionManager.send("sess-send", ping);

        assertThat(sent).isTrue();
        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeastOnce()).sendMessage(captor.capture());

        String jsonSent = captor.getValue().getPayload();
        assertThat(jsonSent).contains("\"type\":\"PING\"");
        assertThat(jsonSent).contains("\"clientTimestamp\":123456789");
    }

    @Test
    @DisplayName("Sending ERROR envelope constructs standard documented ErrorPayload")
    void testSendError() throws IOException {
        WebSocketSession session = mockSession("sess-err");
        connectionManager.register(session);

        boolean sent = connectionManager.sendError("sess-err", ErrorCode.RATE_LIMIT_EXCEEDED, "Too many inputs");
        assertThat(sent).isTrue();

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(session, atLeastOnce()).sendMessage(captor.capture());

        String json = captor.getValue().getPayload();
        assertThat(json).contains("\"type\":\"ERROR\"");
        assertThat(json).contains("\"errorCode\":\"RATE_LIMIT_EXCEEDED\"");
        assertThat(json).contains("Too many inputs");
    }

    @Test
    @DisplayName("Concurrent connection registration and unregistration from 20 threads is safe")
    void testConcurrentRegistration() throws InterruptedException {
        int threads = 20;
        int operationsPerThread = 50;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);

        for (int t = 0; t < threads; t++) {
            final int threadId = t;
            executor.submit(() -> {
                try {
                    for (int i = 0; i < operationsPerThread; i++) {
                        String id = "c-thread-" + threadId + "-idx-" + i;
                        WebSocketSession s = mockSession(id);
                        connectionManager.register(s);
                        connectionManager.updateActivity(id);
                        if (i % 2 == 0) {
                            connectionManager.remove(id);
                        }
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        executor.shutdown();

        // Half of odd connections should remain (25 * 20 = 500)
        assertThat(connectionManager.getConnectionCount()).isEqualTo(threads * (operationsPerThread / 2));
    }
}

