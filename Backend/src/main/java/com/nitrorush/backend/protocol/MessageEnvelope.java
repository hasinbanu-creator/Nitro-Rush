package com.nitrorush.backend.protocol;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.nitrorush.backend.protocol.payload.ErrorPayload;

/**
 * Standard protocol envelope wrapping all Nitro Rush WebSocket communication.
 *
 * @param <T> Payload type
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MessageEnvelope<T> {

    @JsonProperty("protocolVersion")
    private String protocolVersion = "1.0";

    @JsonProperty("type")
    private MessageType type;

    @JsonProperty("timestamp")
    private long timestamp = System.currentTimeMillis();

    @JsonProperty("payload")
    private T payload;

    public MessageEnvelope() {
    }

    public MessageEnvelope(MessageType type, T payload) {
        this.protocolVersion = "1.0";
        this.type = type;
        this.timestamp = System.currentTimeMillis();
        this.payload = payload;
    }

    public MessageEnvelope(String protocolVersion, MessageType type, long timestamp, T payload) {
        this.protocolVersion = protocolVersion;
        this.type = type;
        this.timestamp = timestamp;
        this.payload = payload;
    }

    public static <T> MessageEnvelope<T> of(MessageType type, T payload) {
        return new MessageEnvelope<>(type, payload);
    }

    public static MessageEnvelope<ErrorPayload> error(ErrorCode errorCode, String message) {
        return new MessageEnvelope<>(MessageType.ERROR, new ErrorPayload(errorCode.name(), message));
    }

    public String getProtocolVersion() {
        return protocolVersion;
    }

    public void setProtocolVersion(String protocolVersion) {
        this.protocolVersion = protocolVersion;
    }

    public MessageType getType() {
        return type;
    }

    public void setType(MessageType type) {
        this.type = type;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }

    public T getPayload() {
        return payload;
    }

    public void setPayload(T payload) {
        this.payload = payload;
    }

    @Override
    public String toString() {
        return "MessageEnvelope{" +
                "protocolVersion='" + protocolVersion + '\'' +
                ", type=" + type +
                ", timestamp=" + timestamp +
                ", payload=" + payload +
                '}';
    }
}

