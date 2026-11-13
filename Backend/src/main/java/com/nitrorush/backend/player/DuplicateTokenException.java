package com.nitrorush.backend.player;

/**
 * Thrown when a token hash collision occurs in guest credentials persistence.
 */
public class DuplicateTokenException extends RuntimeException {

    public DuplicateTokenException(String message) {
        super(message);
    }

    public DuplicateTokenException(String message, Throwable cause) {
        super(message, cause);
    }
}

