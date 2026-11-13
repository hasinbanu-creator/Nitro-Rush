package com.nitrorush.backend.player;

import org.hibernate.exception.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Service managing persistent player profiles, lifecycle, and identity within Nitro Rush.
 * Enforces case-insensitive username uniqueness, profile validation, and safe concurrency handling.
 */
@Service
@Transactional(readOnly = true)
public class PlayerService {

    private static final Logger log = LoggerFactory.getLogger(PlayerService.class);

    private static final int MAX_USERNAME_LENGTH = 16;
    private static final int MAX_AVATAR_ID_LENGTH = 50;
    private static final String USERNAME_UNIQUE_CONSTRAINT = "ux_players_username_lower";

    private final PlayerRepository playerRepository;

    public PlayerService(PlayerRepository playerRepository) {
        this.playerRepository = playerRepository;
    }

    /**
     * Creates and persists a new guest player profile with a permanent UUID.
     *
     * @param username requested display username (1-16 characters)
     * @param avatarId optional avatar or vehicle skin identifier
     * @return the newly persisted {@link Player}
     * @throws IllegalArgumentException   if the username is null, empty, or exceeds 16 characters
     * @throws DuplicateUsernameException if the username is already registered (case-insensitive)
     */
    @Transactional
    public Player createGuestPlayer(String username, String avatarId) {
        String trimmedUsername = validateUsername(username);
        String cleanAvatarId = sanitizeAvatarId(avatarId);

        // Preliminary check for fast rejection before hitting the database
        if (playerRepository.existsByUsernameIgnoreCase(trimmedUsername)) {
            throw new DuplicateUsernameException("Username '" + trimmedUsername + "' is already taken");
        }

        // Generate a guaranteed non-colliding permanent UUID
        UUID playerId = UUID.randomUUID();
        while (playerRepository.existsById(playerId)) {
            playerId = UUID.randomUUID();
        }

        Player player = new Player(playerId, trimmedUsername, cleanAvatarId, Player.AccountType.GUEST);

        try {
            Player saved = playerRepository.saveAndFlush(player);
            log.info("Created persistent guest player: playerId={}, username='{}', avatarId='{}'",
                    saved.getPlayerId(), saved.getUsername(), saved.getAvatarId());
            return saved;
        } catch (DataIntegrityViolationException e) {
            if (isUsernameConstraintViolation(e)) {
                log.warn("Database uniqueness violation creating guest player with username '{}'", trimmedUsername);
                throw new DuplicateUsernameException("Username '" + trimmedUsername + "' is already taken", e);
            }
            log.error("Database integrity violation creating guest player with username '{}'", trimmedUsername, e);
            throw e;
        }
    }

    /**
     * Retrieves a persistent player by their permanent UUID.
     *
     * @param playerId player UUID identifier
     * @return an {@link Optional} containing the player if found, or empty otherwise
     */
    public Optional<Player> getPlayerById(UUID playerId) {
        if (playerId == null) {
            return Optional.empty();
        }
        return playerRepository.findById(playerId);
    }

    /**
     * Retrieves a persistent player by their username using case-insensitive lookup.
     *
     * @param username username to look up
     * @return an {@link Optional} containing the player if found, or empty otherwise
     */
    public Optional<Player> getPlayerByUsername(String username) {
        if (username == null || username.isBlank()) {
            return Optional.empty();
        }
        return playerRepository.findByUsernameIgnoreCase(username.trim());
    }

    /**
     * Checks whether a username is available for registration or renaming using case-insensitive matching.
     *
     * @param username username to check
     * @return {@code true} if the username is valid and not already taken, {@code false} otherwise
     */
    public boolean isUsernameAvailable(String username) {
        if (username == null || username.isBlank()) {
            return false;
        }
        String trimmed = username.trim();
        if (trimmed.length() > MAX_USERNAME_LENGTH) {
            return false;
        }
        return !playerRepository.existsByUsernameIgnoreCase(trimmed);
    }

    /**
     * Updates an existing player's profile (display username and/or avatar).
     * Preserves the player's permanent UUID, accountType, and createdAt timestamp.
     *
     * @param playerId player's unique identifier
     * @param username new display username (1-16 characters)
     * @param avatarId optional new avatar ID (only updated if non-null and not blank)
     * @return updated and persisted {@link Player}
     * @throws IllegalArgumentException   if playerId is null or username validation fails
     * @throws PlayerNotFoundException    if no player exists with the provided playerId
     * @throws DuplicateUsernameException if the new username is already used by another player
     */
    @Transactional
    public Player updatePlayerProfile(UUID playerId, String username, String avatarId) {
        if (playerId == null) {
            throw new IllegalArgumentException("Player ID must not be null");
        }

        Player player = playerRepository.findById(playerId)
                .orElseThrow(() -> new PlayerNotFoundException(playerId));

        String trimmedUsername = validateUsername(username);

        // Allow current player to retain their existing username (case-insensitively).
        // Only reject if another player holds this username.
        boolean isSameUsername = player.getUsername().equalsIgnoreCase(trimmedUsername);
        if (!isSameUsername) {
            if (playerRepository.existsByUsernameIgnoreCase(trimmedUsername)) {
                throw new DuplicateUsernameException("Username '" + trimmedUsername + "' is already taken");
            }
        }

        // Apply updated display username (preserving requested casing)
        player.setUsername(trimmedUsername);

        // Update avatar when supplied
        if (avatarId != null && !avatarId.isBlank()) {
            player.setAvatarId(sanitizeAvatarId(avatarId));
        }

        // Note: playerId, accountType and createdAt remain untouched, preserving identity and history.

        try {
            Player saved = playerRepository.saveAndFlush(player);
            log.info("Updated player profile: playerId={}, username='{}', avatarId='{}'",
                    saved.getPlayerId(), saved.getUsername(), saved.getAvatarId());
            return saved;
        } catch (DataIntegrityViolationException e) {
            if (isUsernameConstraintViolation(e)) {
                log.warn("Database uniqueness violation updating player {} with username '{}'", playerId, trimmedUsername);
                throw new DuplicateUsernameException("Username '" + trimmedUsername + "' is already taken", e);
            }
            log.error("Database integrity violation updating player {} with username '{}'", playerId, trimmedUsername, e);
            throw e;
        }
    }

    /**
     * Checks if a {@link DataIntegrityViolationException} is caused by the case-insensitive
     * username unique constraint violation (ux_players_username_lower).
     *
     * @param e the data integrity violation exception
     * @return true if specifically caused by ux_players_username_lower, false for other constraint violations
     */
    private boolean isUsernameConstraintViolation(DataIntegrityViolationException e) {
        Throwable current = e;
        while (current != null) {
            if (current instanceof ConstraintViolationException cve) {
                String constraintName = cve.getConstraintName();
                if (constraintName != null && constraintName.toLowerCase().contains(USERNAME_UNIQUE_CONSTRAINT)) {
                    return true;
                }
            }
            String message = current.getMessage();
            if (message != null && message.toLowerCase().contains(USERNAME_UNIQUE_CONSTRAINT)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private String validateUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("Username must not be empty or blank");
        }
        String trimmed = username.trim();
        if (trimmed.length() > MAX_USERNAME_LENGTH) {
            throw new IllegalArgumentException("Username must not exceed " + MAX_USERNAME_LENGTH + " characters");
        }
        return trimmed;
    }

    private String sanitizeAvatarId(String avatarId) {
        if (avatarId == null || avatarId.isBlank()) {
            return null;
        }
        String trimmed = avatarId.trim();
        if (trimmed.length() > MAX_AVATAR_ID_LENGTH) {
            throw new IllegalArgumentException("Avatar ID must not exceed " + MAX_AVATAR_ID_LENGTH + " characters");
        }
        return trimmed;
    }
}

