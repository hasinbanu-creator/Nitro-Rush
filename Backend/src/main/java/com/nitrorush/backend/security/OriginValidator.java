package com.nitrorush.backend.security;

import com.nitrorush.backend.config.NitroRushProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.List;

/**
 * Validates WebSocket handshake Origin headers against strictly configured allowed origins.
 * Prevents Cross-Site WebSocket Hijacking (CSWSH).
 */
@Component
public class OriginValidator {

    private static final Logger log = LoggerFactory.getLogger(OriginValidator.class);

    private final NitroRushProperties properties;

    public OriginValidator(NitroRushProperties properties) {
        this.properties = properties;
    }

    /**
     * Evaluates whether the requested origin is authorized to connect.
     *
     * @param originHeader raw Origin header from HTTP handshake
     * @return true if approved; false otherwise
     */
    public boolean isAllowed(String originHeader) {
        if (originHeader == null || originHeader.isBlank()) {
            log.warn("WebSocket handshake rejected: Missing or empty Origin header");
            return false;
        }

        String normalizedOrigin = normalizeOrigin(originHeader);
        List<String> allowedOrigins = properties.getWebsocket().getAllowedOrigins();

        for (String allowed : allowedOrigins) {
            if (normalizeOrigin(allowed).equalsIgnoreCase(normalizedOrigin)) {
                log.debug("WebSocket handshake Origin approved: {}", normalizedOrigin);
                return true;
            }
        }

        log.warn("WebSocket handshake rejected: Origin '{}' is not in configured allowed list: {}",
                normalizedOrigin, allowedOrigins);
        return false;
    }

    private String normalizeOrigin(String raw) {
        if (raw == null) return "";
        String trimmed = raw.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        try {
            URI uri = URI.create(trimmed);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            int port = uri.getPort();

            if (scheme != null && host != null) {
                if (port == -1 || (scheme.equalsIgnoreCase("http") && port == 80)
                        || (scheme.equalsIgnoreCase("https") && port == 443)) {
                    return scheme.toLowerCase() + "://" + host.toLowerCase();
                } else {
                    return scheme.toLowerCase() + "://" + host.toLowerCase() + ":" + port;
                }
            }
        } catch (Exception ignored) {
            // Fall back to plain trimmed string
        }
        return trimmed.toLowerCase();
    }
}

