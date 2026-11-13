package com.nitrorush.backend.player;

import org.hibernate.exception.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * Service managing persistent guest bearer credentials, cryptographic token hashing,
 * validation, and atomic player-credential lifecycle operations.
 */
@Service
@Transactional(readOnly = true)
public class GuestCredentialService {

    private static final Logger log = LoggerFactory.getLogger(GuestCredentialService.class);

    private static final String USERNAME_UNIQUE_CONSTRAINT = "ux_players_username_lower";
    private static final String TOKEN_UNIQUE_CONSTRAINT = "ux_guest_credentials_token_hash";
    private static final int MAX_USERNAME_LENGTH = 16;
    private static final int MAX_AVATAR_ID_LENGTH = 50;

    private final PlayerRepository playerRepository;
    private final GuestCredentialRepository guestCredentialRepository;

    public GuestCredentialService(PlayerRepository playerRepository,
                                  GuestCredentialRepository guestCredentialRepository) {
        this.playerRepository = playerRepository;
        this.guestCredentialRepository = guestCredentialRepository;
    }

    /**
     * Computes a deterministic, hex-encoded SHA-256 digest of a bearer token.
     *
     * @param rawToken raw guest bearer token
     * @return 64-character lowercase hex string
     */
    public static String hashToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("Token cannot be null or blank");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available in JVM", e);
        }
    }

    /**
     * Looks up an active, valid player identity using a raw guest bearer token.
     * Rejects revoked or expired credentials.
     * Updates last_used_at on successful recovery.
     *
     * @param rawToken raw guest bearer token
     * @return Optional containing the persistent Player if credential is valid
     */
    @Transactional
    public Optional<Player> findValidPlayerByToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }

        String tokenHash = hashToken(rawToken);
        OffsetDateTime now = OffsetDateTime.now();

        Optional<GuestCredential> credentialOpt = guestCredentialRepository.findValidWithPlayer(tokenHash, now);
        if (credentialOpt.isEmpty()) {
            return Optional.empty();
        }

        GuestCredential credential = credentialOpt.get();
        guestCredentialRepository.updateLastUsedAt(credential.getCredentialId(), now);
        return Optional.of(credential.getPlayer());
    }

    /**
     * Atomically creates and persists a new Player and its corresponding GuestCredential record.
     * Runs in its own standalone transaction (Propagation.REQUIRES_NEW) so that any uniqueness
     * violation rolls back completely and allows safe retries in fresh transactions without
     * PostgreSQL aborted-transaction errors.
     *
     * @param candidateUsername desired display username
     * @param avatarId          optional avatar identifier
     * @param rawToken          raw bearer token to hash and register
     * @return the persisted Player entity
     * @throws DuplicateUsernameException if the username is already registered (case-insensitive)
     * @throws DuplicateTokenException    if the token hash is already registered
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Player createPlayerWithCredential(String candidateUsername, String avatarId, String rawToken) {
        String trimmedUsername = validateUsername(candidateUsername);
        String cleanAvatarId = sanitizeAvatarId(avatarId);
        String tokenHash = hashToken(rawToken);

        if (playerRepository.existsByUsernameIgnoreCase(trimmedUsername)) {
            throw new DuplicateUsernameException("Username '" + trimmedUsername + "' is already taken");
        }

        if (guestCredentialRepository.existsByTokenHash(tokenHash)) {
            throw new DuplicateTokenException("Token hash already registered");
        }

        UUID playerId = UUID.randomUUID();
        while (playerRepository.existsById(playerId)) {
            playerId = UUID.randomUUID();
        }

        Player player = new Player(playerId, trimmedUsername, cleanAvatarId, Player.AccountType.GUEST);

        try {
            Player savedPlayer = playerRepository.saveAndFlush(player);

            GuestCredential credential = new GuestCredential(
                    UUID.randomUUID(),
                    savedPlayer,
                    tokenHash,
                    OffsetDateTime.now()
            );
            guestCredentialRepository.saveAndFlush(credential);

            log.info("Persisted new guest player and credential: playerId={}, username='{}', credentialId={}",
                    savedPlayer.getPlayerId(), savedPlayer.getUsername(), credential.getCredentialId());
            return savedPlayer;

        } catch (DataIntegrityViolationException e) {
            if (isUsernameConstraintViolation(e)) {
                log.warn("Database uniqueness violation on username '{}'", trimmedUsername);
                throw new DuplicateUsernameException("Username '" + trimmedUsername + "' is already taken", e);
            }
            if (isTokenConstraintViolation(e)) {
                log.warn("Database uniqueness violation on token hash");
                throw new DuplicateTokenException("Token hash already registered", e);
            }
            log.error("Database integrity violation during guest creation with username '{}'", trimmedUsername, e);
            throw e;
        }
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

    private boolean isUsernameConstraintViolation(DataIntegrityViolationException e) {
        return matchesConstraint(e, USERNAME_UNIQUE_CONSTRAINT);
    }

    private boolean isTokenConstraintViolation(DataIntegrityViolationException e) {
        return matchesConstraint(e, TOKEN_UNIQUE_CONSTRAINT);
    }

    private boolean matchesConstraint(DataIntegrityViolationException e, String targetConstraint) {
        Throwable current = e;
        while (current != null) {
            if (current instanceof ConstraintViolationException cve) {
                String constraintName = cve.getConstraintName();
                if (constraintName != null && constraintName.toLowerCase().contains(targetConstraint)) {
                    return true;
                }
            }
            String message = current.getMessage();
            if (message != null && message.toLowerCase().contains(targetConstraint)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}

