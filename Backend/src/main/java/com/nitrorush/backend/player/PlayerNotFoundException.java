package com.nitrorush.backend.player;

import java.util.UUID;

/**
 * Thrown when an operation targets a player ID that does not exist in persistence.
 */
public class PlayerNotFoundException extends RuntimeException {

    public PlayerNotFoundException(String message) {
        super(message);
    }

    public PlayerNotFoundException(UUID playerId) {
        super("Player not found with ID: " + playerId);
    }
}

