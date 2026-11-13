package com.nitrorush.backend.session;

import com.nitrorush.backend.config.NitroRushProperties;
import com.nitrorush.backend.player.DuplicateTokenException;
import com.nitrorush.backend.player.DuplicateUsernameException;
import com.nitrorush.backend.player.GuestCredentialService;
import com.nitrorush.backend.player.Player;
import com.nitrorush.backend.player.PlayerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Thread-safe manager for guest user sessions, coordinating in-memory session caching
 * with persistent PostgreSQL player identity and hashed credentials.
 */
@Service
public class GuestSessionManager {

    private static final Logger log = LoggerFactory.getLogger(GuestSessionManager.class);
    private static final int MAX_USERNAME_RETRIES = 5;

    private final NitroRushProperties properties;
    private final GuestCredentialService guestCredentialService;
    private final PlayerService playerService;
    private final SecureRandom secureRandom = new SecureRandom();
    private final ConcurrentMap<String, GuestSession> activeSessions = new ConcurrentHashMap<>();

    @Autowired
    public GuestSessionManager(NitroRushProperties properties,
                               GuestCredentialService guestCredentialService,
                               PlayerService playerService) {
        this.properties = properties;
        this.guestCredentialService = guestCredentialService;
        this.playerService = playerService;
    }

    /**
     * Test / lightweight constructor supporting standalone in-memory execution.
     */
    public GuestSessionManager(NitroRushProperties properties) {
        this(properties, null, null);
    }

    /**
     * Authenticates an existing guest session or provisions a new cryptographically secure guest session.
     * Guarantees:
     * 1. Re-authenticating with an active token returns the cached session in O(1) memory lookup.
     * 2. Reconnecting after server restart recovers the persistent Player via SHA-256 token hash.
     * 3. Valid unmapped legacy tokens are adopted into a newly persisted guest identity.
     * 4. Bounded retries (up to 5 attempts) handle auto-generated guest username collisions across fresh transactions.
     * 5. Concurrent token adoption is resolved safely without duplicate players.
     *
     * @param requestedToken optional existing guest token supplied by client
     * @param displayName    desired display name (sanitized)
     * @param avatarId       optional visual avatar ID
     * @return active GuestSession
     */
    public GuestSession authenticateOrCreate(String requestedToken, String displayName, String avatarId) {
        String cleanName = sanitizeDisplayName(displayName);

        // 1. Fast in-memory path (active session / 15-second race reconnect)
        if (requestedToken != null && !requestedToken.isBlank()) {
            GuestSession existing = activeSessions.get(requestedToken.trim());
            if (existing != null) {
                existing.setDisplayName(cleanName);
                if (avatarId != null && !avatarId.isBlank()) {
                    existing.setAvatarId(avatarId);
                }
                existing.touch();
                log.debug("Re-authenticated active guest session for token={}", maskToken(existing.getGuestToken()));
                return existing;
            }
        }

        // 2. Recovery path (post-restart recovery from PostgreSQL via SHA-256 hash)
        if (guestCredentialService != null && isValidTokenFormat(requestedToken)) {
            Optional<Player> recoveredPlayer = guestCredentialService.findValidPlayerByToken(requestedToken.trim());
            if (recoveredPlayer.isPresent()) {
                Player p = recoveredPlayer.get();
                GuestSession session = new GuestSession(requestedToken.trim(), p.getUsername(), p.getAvatarId(), p.getPlayerId());
                activeSessions.put(requestedToken.trim(), session);
                log.info("Recovered persistent guest session from database: playerId={}, token={}",
                        p.getPlayerId(), maskToken(requestedToken));
                return session;
            }
        }

        // 3. New guest provisioning or legacy token adoption path
        String tokenToRegister = isValidTokenFormat(requestedToken)
                ? requestedToken.trim()
                : generateSecureToken();

        // In-memory fallback if services are null (lightweight test harness)
        if (guestCredentialService == null) {
            GuestSession memSession = new GuestSession(tokenToRegister, cleanName, avatarId, UUID.randomUUID());
            activeSessions.put(tokenToRegister, memSession);
            return memSession;
        }

        Player createdPlayer = null;
        for (int attempt = 1; attempt <= MAX_USERNAME_RETRIES; attempt++) {
            String candidateName;
            if (attempt == 1 && displayName != null && !displayName.isBlank()) {
                candidateName = cleanName;
            } else {
                candidateName = "Racer_" + (1000 + secureRandom.nextInt(9000));
            }

            try {
                // Atomic insert of Player and GuestCredential in a standalone transaction (REQUIRES_NEW)
                createdPlayer = guestCredentialService.createPlayerWithCredential(
                        candidateName, avatarId, tokenToRegister);
                break;

            } catch (DuplicateUsernameException e) {
                log.warn("Username collision on attempt {}/{} for candidateName '{}'", attempt, MAX_USERNAME_RETRIES, candidateName);
                if (attempt == MAX_USERNAME_RETRIES) {
                    log.error("Exhausted all {} attempts to generate unique guest username", MAX_USERNAME_RETRIES);
                    throw e;
                }
            } catch (DuplicateTokenException e) {
                log.warn("Concurrent token adoption detected for token={}. Performing recovery in fresh transaction...",
                        maskToken(tokenToRegister));

                // Losing transaction was rolled back; query winning credential in a fresh transaction
                Optional<Player> existingPlayer = guestCredentialService.findValidPlayerByToken(tokenToRegister);
                if (existingPlayer.isPresent()) {
                    Player p = existingPlayer.get();
                    GuestSession session = new GuestSession(tokenToRegister, p.getUsername(), p.getAvatarId(), p.getPlayerId());
                    activeSessions.put(tokenToRegister, session);
                    return session;
                }

                // If unmapped, generate a fresh token and continue loop
                tokenToRegister = generateSecureToken();
            }
        }

        if (createdPlayer == null) {
            throw new IllegalStateException("Failed to provision persistent guest player after " + MAX_USERNAME_RETRIES + " attempts");
        }

        GuestSession newSession = new GuestSession(
                tokenToRegister, createdPlayer.getUsername(), createdPlayer.getAvatarId(), createdPlayer.getPlayerId());
        activeSessions.put(tokenToRegister, newSession);

        log.info("Created new persistent guest session: playerId={}, username='{}', token={}",
                createdPlayer.getPlayerId(), createdPlayer.getUsername(), maskToken(tokenToRegister));
        return newSession;
    }

    /**
     * Validates whether a token string adheres to standard RFC 4122 UUID formatting.
     */
    public static boolean isValidTokenFormat(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        String trimmed = token.trim();
        return trimmed.matches("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    }

    /**
     * Looks up an existing guest session by token.
     */
    public Optional<GuestSession> getSession(String guestToken) {
        if (guestToken == null || guestToken.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(activeSessions.get(guestToken.trim()));
    }

    /**
     * Validates whether a token exists in active sessions.
     */
    public boolean isValidToken(String guestToken) {
        return guestToken != null && activeSessions.containsKey(guestToken.trim());
    }

    /**
     * Removes an active guest session.
     */
    public boolean removeSession(String guestToken) {
        if (guestToken == null || guestToken.isBlank()) {
            return false;
        }
        GuestSession removed = activeSessions.remove(guestToken.trim());
        if (removed != null) {
            log.info("Removed guest session: token={}", maskToken(guestToken));
            return true;
        }
        return false;
    }

    public int getActiveSessionCount() {
        return activeSessions.size();
    }

    public void clearAll() {
        activeSessions.clear();
    }

    /**
     * Generates a cryptographically strong UUID token using SecureRandom.
     */
    public String generateSecureToken() {
        byte[] randomBytes = new byte[16];
        secureRandom.nextBytes(randomBytes);

        // Conform to RFC 4122 Version 4 UUID bits
        randomBytes[6] &= 0x0f;
        randomBytes[6] |= 0x40; // Version 4
        randomBytes[8] &= 0x3f;
        randomBytes[8] |= (byte) 0x80; // Variant 2

        long msb = 0;
        long lsb = 0;
        for (int i = 0; i < 8; i++) {
            msb = (msb << 8) | (randomBytes[i] & 0xff);
        }
        for (int i = 8; i < 16; i++) {
            lsb = (lsb << 8) | (randomBytes[i] & 0xff);
        }

        return new UUID(msb, lsb).toString();
    }

    /**
     * Masks token to prevent sensitive credential exposure in logs.
     * Never logs full guest tokens.
     */
    public static String maskToken(String token) {
        if (token == null) {
            return "null";
        }
        if (token.length() >= 12) {
            return token.substring(0, 8) + "..." + token.substring(token.length() - 4);
        }
        return "***";
    }

    private String sanitizeDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return "Racer_" + (1000 + secureRandom.nextInt(9000));
        }
        String clean = displayName.trim().replaceAll("[^a-zA-Z0-9_ -]", "");
        if (clean.length() < 2) {
            return "Racer_" + (1000 + secureRandom.nextInt(9000));
        }
        if (clean.length() > 16) {
            clean = clean.substring(0, 16);
        }
        return clean;
    }
}
