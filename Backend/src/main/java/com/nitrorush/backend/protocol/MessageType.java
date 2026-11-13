package com.nitrorush.backend.protocol;

/**
 * Formal inventory of documented Nitro Rush WebSocket message types (Protocol v1.0).
 */
public enum MessageType {

    // ==========================================
    // Client-to-Server Messages (Client Outbound)
    // ==========================================
    CONNECT(Direction.CLIENT_TO_SERVER),
    AUTHENTICATE_GUEST(Direction.CLIENT_TO_SERVER),
    JOIN_MATCHMAKING(Direction.CLIENT_TO_SERVER),
    CANCEL_MATCHMAKING(Direction.CLIENT_TO_SERVER),
    SELECT_CAR(Direction.CLIENT_TO_SERVER),
    PLAYER_READY(Direction.CLIENT_TO_SERVER),
    PLAYER_INPUT(Direction.CLIENT_TO_SERVER),
    PING(Direction.CLIENT_TO_SERVER),
    RECONNECT(Direction.CLIENT_TO_SERVER),
    CREATE_PRIVATE_ROOM(Direction.CLIENT_TO_SERVER),
    JOIN_PRIVATE_ROOM(Direction.CLIENT_TO_SERVER),
    LEAVE_PRIVATE_ROOM(Direction.CLIENT_TO_SERVER),
    START_PRIVATE_RACE(Direction.CLIENT_TO_SERVER),

    // ==========================================
    // Server-to-Client Messages (Server Outbound)
    // ==========================================
    CONNECTION_ACCEPTED(Direction.SERVER_TO_CLIENT),
    AUTHENTICATION_RESULT(Direction.SERVER_TO_CLIENT),
    MATCHMAKING_STATUS(Direction.SERVER_TO_CLIENT),
    ROOM_ASSIGNED(Direction.SERVER_TO_CLIENT),
    PRIVATE_ROOM_CREATED(Direction.SERVER_TO_CLIENT),
    PRIVATE_ROOM_JOINED(Direction.SERVER_TO_CLIENT),
    PRIVATE_ROOM_UPDATED(Direction.SERVER_TO_CLIENT),
    PRIVATE_ROOM_ERROR(Direction.SERVER_TO_CLIENT),
    PLAYER_JOINED(Direction.SERVER_TO_CLIENT),
    PLAYER_LEFT(Direction.SERVER_TO_CLIENT),
    PLAYER_READY_STATUS(Direction.SERVER_TO_CLIENT),
    COUNTDOWN_STARTED(Direction.SERVER_TO_CLIENT),
    RACE_STARTED(Direction.SERVER_TO_CLIENT),
    RACE_STATE(Direction.SERVER_TO_CLIENT),
    PLAYER_DISCONNECTED(Direction.SERVER_TO_CLIENT),
    PLAYER_RECONNECTED(Direction.SERVER_TO_CLIENT),
    RACE_FINISHED(Direction.SERVER_TO_CLIENT),
    RACE_RESULTS(Direction.SERVER_TO_CLIENT),
    ERROR(Direction.SERVER_TO_CLIENT),
    PONG(Direction.SERVER_TO_CLIENT);

    public enum Direction {
        CLIENT_TO_SERVER,
        SERVER_TO_CLIENT
    }

    private final Direction direction;

    MessageType(Direction direction) {
        this.direction = direction;
    }

    public Direction getDirection() {
        return direction;
    }

    public boolean isClientToServer() {
        return direction == Direction.CLIENT_TO_SERVER;
    }

    public boolean isServerToClient() {
        return direction == Direction.SERVER_TO_CLIENT;
    }
}

