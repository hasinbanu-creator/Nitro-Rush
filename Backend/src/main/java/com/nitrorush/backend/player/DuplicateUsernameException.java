package com.nitrorush.backend.player;

/**
 * Thrown when a player creation or username change violates case-insensitive username uniqueness.
 */
public class DuplicateUsernameException extends RuntimeException {

    public DuplicateUsernameException(String message) {
        super(message);
    }

    public DuplicateUsernameException(String message, Throwable cause) {
        super(message, cause);
    }
}

