package com.nitrorush.backend.protocol;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nitrorush.backend.protocol.payload.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProtocolSerializationTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
    }

    @Test
    @DisplayName("Serialization of MessageEnvelope follows documented protocol schema exactly")
    void testEnvelopeSerialization() throws JsonProcessingException {
        ConnectPayload payload = new ConnectPayload("1.0.0", "web-browser");
        MessageEnvelope<ConnectPayload> envelope = MessageEnvelope.of(MessageType.CONNECT, payload);

        String json = objectMapper.writeValueAsString(envelope);

        assertThat(json).contains("\"protocolVersion\":\"1.0\"");
        assertThat(json).contains("\"type\":\"CONNECT\"");
        assertThat(json).contains("\"clientVersion\":\"1.0.0\"");
        assertThat(json).contains("\"platform\":\"web-browser\"");
        assertThat(json).contains("\"timestamp\":");
    }

    @Test
    @DisplayName("Deserialization of documented PING message parses accurately")
    void testPingDeserialization() throws JsonProcessingException {
        String json = """
                {
                  "protocolVersion": "1.0",
                  "type": "PING",
                  "timestamp": 1730985640000,
                  "payload": {
                    "clientTimestamp": 1730985640000
                  }
                }
                """;

        JsonNode root = objectMapper.readTree(json);
        assertThat(root.get("protocolVersion").asText()).isEqualTo("1.0");
        assertThat(MessageType.valueOf(root.get("type").asText())).isEqualTo(MessageType.PING);

        PingPayload payload = objectMapper.treeToValue(root.get("payload"), PingPayload.class);
        assertThat(payload.getClientTimestamp()).isEqualTo(1730985640000L);
    }

    @Test
    @DisplayName("Deserialization of documented AUTHENTICATE_GUEST message parses accurately")
    void testAuthenticateGuestDeserialization() throws JsonProcessingException {
        String json = """
                {
                  "protocolVersion": "1.0",
                  "type": "AUTHENTICATE_GUEST",
                  "timestamp": 1730985600050,
                  "payload": {
                    "guestToken": "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145",
                    "displayName": "SpeedDemon99"
                  }
                }
                """;

        JsonNode root = objectMapper.readTree(json);
        assertThat(MessageType.valueOf(root.get("type").asText())).isEqualTo(MessageType.AUTHENTICATE_GUEST);

        AuthenticateGuestPayload payload = objectMapper.treeToValue(root.get("payload"), AuthenticateGuestPayload.class);
        assertThat(payload.getGuestToken()).isEqualTo("a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145");
        assertThat(payload.getDisplayName()).isEqualTo("SpeedDemon99");
    }

    @Test
    @DisplayName("Malformed JSON throws JsonProcessingException and does not crash")
    void testMalformedJsonHandling() {
        String malformedJson = "{ protocolVersion: 1.0, type: PING, missingQuotes }";

        assertThatThrownBy(() -> objectMapper.readTree(malformedJson))
                .isInstanceOf(JsonProcessingException.class);
    }

    @Test
    @DisplayName("All MessageType enum entries belong to documented direction")
    void testMessageTypeDirectionality() {
        assertThat(MessageType.CONNECT.isClientToServer()).isTrue();
        assertThat(MessageType.AUTHENTICATE_GUEST.isClientToServer()).isTrue();
        assertThat(MessageType.PING.isClientToServer()).isTrue();

        assertThat(MessageType.CONNECTION_ACCEPTED.isServerToClient()).isTrue();
        assertThat(MessageType.AUTHENTICATION_RESULT.isServerToClient()).isTrue();
        assertThat(MessageType.ROOM_ASSIGNED.isServerToClient()).isTrue();
        assertThat(MessageType.RACE_STATE.isServerToClient()).isTrue();
        assertThat(MessageType.ERROR.isServerToClient()).isTrue();
        assertThat(MessageType.PONG.isServerToClient()).isTrue();
    }
}

