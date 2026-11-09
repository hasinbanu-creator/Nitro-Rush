package com.nitrorush.backend.session;

import com.nitrorush.backend.config.NitroRushProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * In-memory manager for guest user sessions.
 * Generates cryptographically secure session tokens using SecureRandom.
 * Note: Guest tokens serve as the initial lightweight player identity foundation
 * and are not a substitute for production OAuth2/JWT authentication.
 */
@Service
public class GuestSessionManager {

    private static final Logger log = LoggerFactory.getLogger(GuestSessionManager.class);

    private final NitroRushProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();
    private final ConcurrentMap<String, GuestSession> activeSessions = new ConcurrentHashMap<>();

    public GuestSessionManager(NitroRushProperties properties) {
        this.properties = properties;
    }

    /**
     * Authenticates an existing guest session or provisions a new cryptographically secure guest session.
     *
     * @param requestedToken optional existing guest token supplied by client
     * @param displayName    desired display name (sanitized)
     * @param avatarId       optional visual avatar ID
     * @return active GuestSession
     */
    public GuestSession authenticateOrCreate(String requestedToken, String displayName, String avatarId) {
        String cleanName = sanitizeDisplayName(displayName);

        if (requestedToken != null && !requestedToken.isBlank()) {
            GuestSession existing = activeSessions.get(requestedToken.trim());
            if (existing != null) {
                existing.setDisplayName(cleanName);
                if (avatarId != null && !avatarId.isBlank()) {
                    existing.setAvatarId(avatarId);
                }
                existing.touch();
                log.debug("Re-authenticated guest session for token={}", maskToken(existing.getGuestToken()));
                return existing;
            }
        }

        // Provision new cryptographically secure token
        String newToken = generateSecureToken();
        GuestSession newSession = new GuestSession(newToken, cleanName, avatarId);
        activeSessions.put(newToken, newSession);

        log.info("Created new guest session: displayName='{}', token={}", cleanName, maskToken(newToken));
        return newSession;
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

