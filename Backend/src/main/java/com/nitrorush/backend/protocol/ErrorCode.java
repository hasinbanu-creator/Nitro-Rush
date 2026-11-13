package com.nitrorush.backend.protocol;

/**
 * Standard protocol error codes matching Nitro Rush WebSocket specification.
 */
public enum ErrorCode {
    INVALID_PROTOCOL_VERSION,
    INVALID_PAYLOAD,
    RATE_LIMIT_EXCEEDED,
    ROOM_FULL,
    ROOM_NOT_FOUND,
    SESSION_EXPIRED,
    INVALID_CREDENTIALS,
    USERNAME_CONTAINS_PROFANITY,
    ALREADY_IN_QUEUE,
    NOT_IN_QUEUE,
    ALREADY_IN_RACE,
    INVALID_CAR_ID,
    ROOM_NOT_IN_LOBBY,
    ROOM_STATE_INVALID,
    UNSUPPORTED_MESSAGE_TYPE,
    INVALID_INPUT_VALUES,
    ROOM_ALREADY_CLOSED,
    INVALID_RECONNECT_TOKEN,
    INVALID_ROOM_CODE,
    NOT_ROOM_HOST,
    NOT_ENOUGH_PLAYERS,
    PLAYERS_NOT_READY,
    INTERNAL_ERROR;

    public String getCode() {
        return name();
    }
}
