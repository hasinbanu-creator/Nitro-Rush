package com.nitrorush.backend.room;

/**
 * Formal multiplayer room lifecycle states.
 */
public enum RoomState {
    WAITING,
    COUNTDOWN,
    RACING,
    FINISHED,
    CLOSED;

    public boolean canAcceptJoins() {
        return this == WAITING;
    }

    public boolean isSimulating() {
        return this == RACING;
    }

    public boolean isTerminal() {
        return this == CLOSED;
    }
}

