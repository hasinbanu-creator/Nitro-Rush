package com.nitrorush.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.room.RoomManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Tag("integration")
public class RoomWebSocketIntegrationTest {

  @LocalServerPort
  private int port;

  @Autowired
  private RoomManager roomManager;

  private ObjectMapper objectMapper;
  private StandardWebSocketClient client;
  private String wsUri;
  private WebSocketHttpHeaders headers;

  @BeforeEach
  void setUp() {
    objectMapper = new ObjectMapper();
    client = new StandardWebSocketClient();
    wsUri = "ws://127.0.0.1:" + port + "/ws/game";

    headers = new WebSocketHttpHeaders();
    headers.setOrigin("http://localhost:5173");
  }

  private static class TestClientHandler extends TextWebSocketHandler {
    final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
    final CompletableFuture<WebSocketSession> openFuture = new CompletableFuture<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
      openFuture.complete(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
      messages.offer(message.getPayload());
    }

    public JsonNode awaitMessageOfType(String type, long timeoutMs) throws Exception {
      long deadline = System.currentTimeMillis() + timeoutMs;
      ObjectMapper mapper = new ObjectMapper();
      while (System.currentTimeMillis() < deadline) {
        long remaining = deadline - System.currentTimeMillis();
        String raw = messages.poll(Math.max(10, remaining), TimeUnit.MILLISECONDS);
        if (raw != null) {
          JsonNode node = mapper.readTree(raw);
          if (node.has("type") && type.equals(node.get("type").asText())) {
            return node;
          }
        }
      }
      return null;
    }
  }

  private WebSocketSession connectClient(TestClientHandler handler) throws Exception {
    return client.execute(handler, headers, URI.create(wsUri)).get(5, TimeUnit.SECONDS);
  }

  private String authenticate(WebSocketSession session, TestClientHandler handler, String name) throws Exception {
    handler.awaitMessageOfType("CONNECTION_ACCEPTED", 3000);

    String authMsg = """
        {
          "protocolVersion": "1.0",
          "type": "AUTHENTICATE_GUEST",
          "timestamp": %d,
          "payload": {
            "displayName": "%s"
          }
        }
        """.formatted(System.currentTimeMillis(), name);

    session.sendMessage(new TextMessage(authMsg));
    JsonNode authResult = handler.awaitMessageOfType("AUTHENTICATION_RESULT", 3000);
    assertNotNull(authResult);
    assertTrue(authResult.get("payload").get("success").asBoolean());
    return authResult.get("payload").get("guestToken").asText();
  }

  @Test
  @DisplayName("End-to-End WebSocket: Authenticate, Join room, Select Car, Ready, and Receive Countdown")
  public void testFullLobbyFlowOverWebSocket() throws Exception {
    TestClientHandler h1 = new TestClientHandler();
    WebSocketSession s1 = connectClient(h1);
    String token1 = authenticate(s1, h1, "RacerOne");

    TestClientHandler h2 = new TestClientHandler();
    WebSocketSession s2 = connectClient(h2);
    String token2 = authenticate(s2, h2, "RacerTwo");

    // Client 1 joins room
    String joinMsg1 = """
        {
          "protocolVersion": "1.0",
          "type": "JOIN_MATCHMAKING",
          "timestamp": %d,
          "payload": {
            "preferredTrackId": "coastal-rush",
            "preferredCarId": "bolt-gt",
            "roomId": "room-ws-test"
          }
        }
        """.formatted(System.currentTimeMillis());
    s1.sendMessage(new TextMessage(joinMsg1));

    JsonNode assigned1 = h1.awaitMessageOfType("ROOM_ASSIGNED", 3000);
    assertNotNull(assigned1, "Expected ROOM_ASSIGNED message for client 1");
    assertEquals("room-ws-test", assigned1.get("payload").get("roomId").asText());
    assertEquals("P1", assigned1.get("payload").get("slotId").asText());

    // Client 2 joins same room
    String joinMsg2 = """
        {
          "protocolVersion": "1.0",
          "type": "JOIN_MATCHMAKING",
          "timestamp": %d,
          "payload": {
            "preferredTrackId": "coastal-rush",
            "preferredCarId": "viper-r",
            "roomId": "room-ws-test"
          }
        }
        """.formatted(System.currentTimeMillis());
    s2.sendMessage(new TextMessage(joinMsg2));

    JsonNode assigned2 = h2.awaitMessageOfType("ROOM_ASSIGNED", 3000);
    assertNotNull(assigned2, "Expected ROOM_ASSIGNED message for client 2");
    assertEquals("P2", assigned2.get("payload").get("slotId").asText());

    // Client 1 should receive PLAYER_JOINED notification for Client 2
    JsonNode joinedNotice = h1.awaitMessageOfType("PLAYER_JOINED", 3000);
    assertNotNull(joinedNotice, "Client 1 must receive PLAYER_JOINED notification");
    assertEquals("P2", joinedNotice.get("payload").get("player").get("slot").asText());

    // Client 1 selects car "titan-v8"
    String selectCarMsg = """
        {
          "protocolVersion": "1.0",
          "type": "SELECT_CAR",
          "timestamp": %d,
          "payload": {
            "roomId": "room-ws-test",
            "carId": "titan-v8"
          }
        }
        """.formatted(System.currentTimeMillis());
    s1.sendMessage(new TextMessage(selectCarMsg));

    JsonNode carUpdate = h1.awaitMessageOfType("PLAYER_READY_STATUS", 3000);
    assertNotNull(carUpdate);
    assertEquals("titan-v8", carUpdate.get("payload").get("carId").asText());

    // Client 1 sets ready
    String readyMsg1 = """
        {
          "protocolVersion": "1.0",
          "type": "PLAYER_READY",
          "timestamp": %d,
          "payload": {
            "roomId": "room-ws-test",
            "isReady": true
          }
        }
        """.formatted(System.currentTimeMillis());
    s1.sendMessage(new TextMessage(readyMsg1));

    // Client 2 sets ready -> confirms ready status broadcast
    String readyMsg2 = """
        {
          "protocolVersion": "1.0",
          "type": "PLAYER_READY",
          "timestamp": %d,
          "payload": {
            "roomId": "room-ws-test",
            "isReady": true
          }
        }
        """.formatted(System.currentTimeMillis());
    s2.sendMessage(new TextMessage(readyMsg2));

    JsonNode readyNotice = h1.awaitMessageOfType("PLAYER_READY_STATUS", 3000);
    assertNotNull(readyNotice, "Client 1 must receive PLAYER_READY_STATUS");

    // Clients 3 through 8 join and ready up -> reaching 8 players triggers
    // COUNTDOWN_STARTED immediately
    List<WebSocketSession> extraSessions = new java.util.ArrayList<>();
    List<TestClientHandler> extraHandlers = new java.util.ArrayList<>();
    for (int i = 3; i <= 8; i++) {
      TestClientHandler hi = new TestClientHandler();
      WebSocketSession si = connectClient(hi);
      authenticate(si, hi, "Racer" + i);
      si.sendMessage(new TextMessage("""
          {
            "protocolVersion": "1.0",
            "type": "JOIN_MATCHMAKING",
            "timestamp": %d,
            "payload": {
              "preferredTrackId": "coastal-rush",
              "preferredCarId": "bolt-gt",
              "roomId": "room-ws-test"
            }
          }
          """.formatted(System.currentTimeMillis())));
      hi.awaitMessageOfType("ROOM_ASSIGNED", 3000);
      si.sendMessage(new TextMessage("""
          {
            "protocolVersion": "1.0",
            "type": "PLAYER_READY",
            "timestamp": %d,
            "payload": {
              "roomId": "room-ws-test",
              "isReady": true
            }
          }
          """.formatted(System.currentTimeMillis())));
      extraSessions.add(si);
      extraHandlers.add(hi);
    }

    // Both client 1 and client 2 receive COUNTDOWN_STARTED immediately upon 8th
    // ready player
    JsonNode countdownNotice1 = h1.awaitMessageOfType("COUNTDOWN_STARTED", 3000);
    JsonNode countdownNotice2 = h2.awaitMessageOfType("COUNTDOWN_STARTED", 3000);

    assertNotNull(countdownNotice1, "Client 1 must receive COUNTDOWN_STARTED");
    assertNotNull(countdownNotice2, "Client 2 must receive COUNTDOWN_STARTED");
    assertEquals(3, countdownNotice1.get("payload").get("durationSeconds").asInt());

    s1.close();
    s2.close();
    for (WebSocketSession session : extraSessions) {
      session.close();
    }
  }
}
