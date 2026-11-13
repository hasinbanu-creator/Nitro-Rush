package com.nitrorush.backend.session;

import com.nitrorush.backend.config.NitroRushProperties;
import com.nitrorush.backend.player.DuplicateTokenException;
import com.nitrorush.backend.player.DuplicateUsernameException;
import com.nitrorush.backend.player.GuestCredentialService;
import com.nitrorush.backend.player.Player;
import com.nitrorush.backend.player.PlayerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("GuestSessionManager Persistence & Concurrency Unit Tests")
class GuestSessionManagerPersistenceTest {

    @Mock
    private GuestCredentialService guestCredentialService;

    @Mock
    private PlayerService playerService;

    private NitroRushProperties properties;
    private GuestSessionManager guestSessionManager;

    @BeforeEach
    void setUp() {
        properties = new NitroRushProperties();
        guestSessionManager = new GuestSessionManager(properties, guestCredentialService, playerService);
    }

    @Test
    @DisplayName("1. Username retry: collides on attempt 1, retries and succeeds on attempt 2 in fresh transaction")
    void testUsernameRetryAfterCollision() {
        UUID playerId = UUID.randomUUID();
        Player player2 = new Player(playerId, "Racer_9999", "bolt-gt", Player.AccountType.GUEST);

        // Attempt 1 fails with collision on candidate name
        when(guestCredentialService.createPlayerWithCredential(eq("Racer"), any(), anyString()))
                .thenThrow(new DuplicateUsernameException("Username 'Racer' is already taken"));

        // Attempt 2 succeeds with newly generated candidate name
        when(guestCredentialService.createPlayerWithCredential(startsWith("Racer_"), any(), anyString()))
                .thenReturn(player2);

        GuestSession session = guestSessionManager.authenticateOrCreate(null, "Racer", "bolt-gt");

        assertNotNull(session);
        assertEquals(playerId, session.getPlayerId());
        assertEquals("Racer_9999", session.getDisplayName());
        verify(guestCredentialService, times(2)).createPlayerWithCredential(anyString(), any(), anyString());
    }

    @Test
    @DisplayName("2. Username retry exhaustion: throws DuplicateUsernameException after 5 failed attempts")
    void testUsernameRetryExhaustion() {
        when(guestCredentialService.createPlayerWithCredential(anyString(), any(), anyString()))
                .thenThrow(new DuplicateUsernameException("Username already taken"));

        assertThrows(DuplicateUsernameException.class, () ->
                guestSessionManager.authenticateOrCreate(null, "AlwaysColliding", "bolt-gt"));

        verify(guestCredentialService, times(5)).createPlayerWithCredential(anyString(), any(), anyString());
    }

    @Test
    @DisplayName("3. Concurrent adoption: losing transaction recovers winning player in fresh transaction without duplicate")
    void testConcurrentAdoptionRecovery() {
        String legacyToken = UUID.randomUUID().toString();
        UUID winningPlayerId = UUID.randomUUID();
        Player winningPlayer = new Player(winningPlayerId, "WinningRacer", "car-1", Player.AccountType.GUEST);

        // First attempt to insert this token fails due to concurrent adoption by Tab 1
        when(guestCredentialService.createPlayerWithCredential(anyString(), any(), eq(legacyToken)))
                .thenThrow(new DuplicateTokenException("Token hash already registered"));

        // Tab 2 catches DuplicateTokenException and queries in a fresh transaction, finding Tab 1's player
        when(guestCredentialService.findValidPlayerByToken(eq(legacyToken)))
                .thenReturn(Optional.empty()) // Before adoption attempt
                .thenReturn(Optional.of(winningPlayer)); // After losing adoption attempt

        GuestSession session = guestSessionManager.authenticateOrCreate(legacyToken, "WinningRacer", "car-1");

        assertNotNull(session);
        assertEquals(winningPlayerId, session.getPlayerId());
        assertEquals("WinningRacer", session.getDisplayName());
        assertEquals(legacyToken, session.getGuestToken());

        // Verifies session is cached in memory
        assertTrue(guestSessionManager.isValidToken(legacyToken));
    }

    @Test
    @DisplayName("4. Post-restart recovery: in-memory cache reset recovers persistent player from DB")
    void testRecoveryAfterMemoryCacheReset() {
        String token = UUID.randomUUID().toString();
        UUID playerId = UUID.randomUUID();
        Player player = new Player(playerId, "PersistedRacer", "car-1", Player.AccountType.GUEST);

        when(guestCredentialService.findValidPlayerByToken(token)).thenReturn(Optional.of(player));

        // Authenticate with existing token when activeSessions is empty (simulating server restart)
        guestSessionManager.clearAll();
        GuestSession session = guestSessionManager.authenticateOrCreate(token, "PersistedRacer", "car-1");

        assertNotNull(session);
        assertEquals(playerId, session.getPlayerId());
        assertEquals("PersistedRacer", session.getDisplayName());
        verify(guestCredentialService).findValidPlayerByToken(token);
        verify(guestCredentialService, never()).createPlayerWithCredential(anyString(), any(), anyString());
    }

    @Test
    @DisplayName("5. In-race 15s reconnect: memory hit returns active session without hitting DB")
    void testInRaceReconnect_FastMemoryHit() {
        String token = UUID.randomUUID().toString();
        UUID playerId = UUID.randomUUID();
        Player player = new Player(playerId, "ActiveRacer", "car-1", Player.AccountType.GUEST);

        when(guestCredentialService.createPlayerWithCredential(anyString(), any(), eq(token)))
                .thenReturn(player);

        // Initial connection
        GuestSession initial = guestSessionManager.authenticateOrCreate(token, "ActiveRacer", "car-1");
        assertNotNull(initial);

        // Reconnect within active session (e.g. 15-second grace window)
        reset(guestCredentialService);
        GuestSession reconnected = guestSessionManager.authenticateOrCreate(token, "ActiveRacer", "car-1");

        assertSame(initial, reconnected);
        verifyNoInteractions(guestCredentialService);
    }

    @Test
    @DisplayName("6. Malformed token is discarded and fresh token is issued safely")
    void testMalformedTokenHandling() {
        String malformedToken = "not-a-valid-uuid-token!@#$";
        UUID newPlayerId = UUID.randomUUID();
        Player newPlayer = new Player(newPlayerId, "CleanRacer", null, Player.AccountType.GUEST);

        when(guestCredentialService.createPlayerWithCredential(anyString(), any(), anyString()))
                .thenReturn(newPlayer);

        GuestSession session = guestSessionManager.authenticateOrCreate(malformedToken, "CleanRacer", null);

        assertNotNull(session);
        assertNotEquals(malformedToken, session.getGuestToken());
        assertTrue(GuestSessionManager.isValidTokenFormat(session.getGuestToken()));
        verify(guestCredentialService, never()).findValidPlayerByToken(malformedToken);
    }
}

