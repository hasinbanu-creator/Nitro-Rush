package com.nitrorush.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Type-safe configuration properties for Nitro Rush multiplayer backend.
 */
@ConfigurationProperties(prefix = "nitrorush")
public class NitroRushProperties {

    private final WebSocket websocket = new WebSocket();
    private final Session session = new Session();

    public WebSocket getWebsocket() {
        return websocket;
    }

    public Session getSession() {
        return session;
    }

    public static class WebSocket {
        private String path = "/ws/game";
        private List<String> allowedOrigins = new ArrayList<>(List.of(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:3000"
        ));
        private long heartbeatIntervalMs = 10000L;
        private int maxFrameSize = 4096;

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public List<String> getAllowedOrigins() {
            return allowedOrigins;
        }

        public void setAllowedOrigins(List<String> allowedOrigins) {
            this.allowedOrigins = allowedOrigins;
        }

        public long getHeartbeatIntervalMs() {
            return heartbeatIntervalMs;
        }

        public void setHeartbeatIntervalMs(long heartbeatIntervalMs) {
            this.heartbeatIntervalMs = heartbeatIntervalMs;
        }

        public int getMaxFrameSize() {
            return maxFrameSize;
        }

        public void setMaxFrameSize(int maxFrameSize) {
            this.maxFrameSize = maxFrameSize;
        }
    }

    public static class Session {
        private String guestTokenPrefix = "GR-";
        private int guestTokenEntropyBytes = 16;
        private long sessionTimeoutMinutes = 60L;

        public String getGuestTokenPrefix() {
            return guestTokenPrefix;
        }

        public void setGuestTokenPrefix(String guestTokenPrefix) {
            this.guestTokenPrefix = guestTokenPrefix;
        }

        public int getGuestTokenEntropyBytes() {
            return guestTokenEntropyBytes;
        }

        public void setGuestTokenEntropyBytes(int guestTokenEntropyBytes) {
            this.guestTokenEntropyBytes = guestTokenEntropyBytes;
        }

        public long getSessionTimeoutMinutes() {
            return sessionTimeoutMinutes;
        }

        public void setSessionTimeoutMinutes(long sessionTimeoutMinutes) {
            this.sessionTimeoutMinutes = sessionTimeoutMinutes;
        }
    }
}

