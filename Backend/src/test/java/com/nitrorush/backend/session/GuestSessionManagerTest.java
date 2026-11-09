package com.nitrorush.backend.session;

import com.nitrorush.backend.config.NitroRushProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class GuestSessionManagerTest {

    private GuestSessionManager manager;

    @BeforeEach
    void setUp() {
        NitroRushProperties props = new NitroRushProperties();
        manager = new GuestSessionManager(props);
    }

    @Test
    @DisplayName("Guest tokens are generated using cryptographically secure random bytes and are unique across 1,000 generations")
    void testTokenUniqueness() {
        int count = 1000;
        Set<String> generatedTokens = new HashSet<>(count);

        for (int i = 0; i < count; i++) {
            String token = manager.generateSecureToken();
            assertThat(token).isNotBlank();
            assertThat(token).matches("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
            assertThat(generatedTokens.add(token)).as("Token must be unique").isTrue();
        }

        assertThat(generatedTokens).hasSize(count);
    }

    @Test
    @DisplayName("Token masking never exposes full token in logs or string representations")
    void testTokenMasking() {
        String token = "a8f3b2e1-4c6d-49f8-b3d5-9871e62a0145";
        String masked = GuestSessionManager.maskToken(token);

        assertThat(masked).isEqualTo("a8f3b2e1...0145");
        assertThat(masked).doesNotContain("4c6d-49f8-b3d5");

        GuestSession session = manager.authenticateOrCreate(null, "TestRacer", null);
        assertThat(session.toString()).doesNotContain(session.getGuestToken());
        assertThat(session.toString()).contains(GuestSessionManager.maskToken(session.getGuestToken()));
    }

    @Test
    @DisplayName("Authentication with null or empty token creates a fresh guest session")
    void testCreateNewSession() {
        GuestSession session = manager.authenticateOrCreate(null, "TurboRacer", "car_bolt_gt");

        assertThat(session).isNotNull();
        assertThat(session.getGuestToken()).isNotBlank();
        assertThat(session.getDisplayName()).isEqualTo("TurboRacer");
        assertThat(session.getAvatarId()).isEqualTo("car_bolt_gt");
        assertThat(manager.getActiveSessionCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("Authentication with an existing valid token re-authenticates and updates active session")
    void testReAuthenticateExistingSession() {
        GuestSession initial = manager.authenticateOrCreate(null, "InitialName", null);
        String token = initial.getGuestToken();

        GuestSession reAuth = manager.authenticateOrCreate(token, "UpdatedName", "new_avatar");

        assertThat(reAuth.getGuestToken()).isEqualTo(token);
        assertThat(reAuth.getDisplayName()).isEqualTo("UpdatedName");
        assertThat(reAuth.getAvatarId()).isEqualTo("new_avatar");
        assertThat(manager.getActiveSessionCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("Display name sanitization strips illegal characters and enforces length bounds")
    void testDisplayNameSanitization() {
        GuestSession s1 = manager.authenticateOrCreate(null, "<script>alert('xss')</script>", null);
        assertThat(s1.getDisplayName()).doesNotContain("<").doesNotContain(">");

        GuestSession s2 = manager.authenticateOrCreate(null, "SuperLongRacerNameThatExceedsLimit", null);
        assertThat(s2.getDisplayName().length()).isLessThanOrEqualTo(16);

        GuestSession s3 = manager.authenticateOrCreate(null, "", null);
        assertThat(s3.getDisplayName()).startsWith("Racer_");
    }

    @Test
    @DisplayName("Concurrent token generation and session creation is thread-safe")
    void testConcurrentSessionCreation() throws InterruptedException {
        int threadCount = 20;
        int operationsPerThread = 50;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);
        ConcurrentHashMap<String, Boolean> tokens = new ConcurrentHashMap<>();

        for (int i = 0; i < threadCount; i++) {
            final int threadId = i;
            executor.submit(() -> {
                try {
                    for (int j = 0; j < operationsPerThread; j++) {
                        GuestSession session = manager.authenticateOrCreate(null, "Racer_" + threadId + "_" + j, null);
                        tokens.put(session.getGuestToken(), true);
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        executor.shutdown();

        assertThat(tokens).hasSize(threadCount * operationsPerThread);
        assertThat(manager.getActiveSessionCount()).isEqualTo(threadCount * operationsPerThread);
    }
}

