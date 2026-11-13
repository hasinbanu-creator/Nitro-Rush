package com.nitrorush.backend.player;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("GuestCredentialService Unit Tests")
class GuestCredentialServiceTest {

    @Mock
    private PlayerRepository playerRepository;

    @Mock
    private GuestCredentialRepository guestCredentialRepository;

    private GuestCredentialService guestCredentialService;

    @BeforeEach
    void setUp() {
        guestCredentialService = new GuestCredentialService(playerRepository, guestCredentialRepository);
    }

    @Test
    @DisplayName("hashToken: computes deterministic 64-char SHA-256 hex string")
    void testHashToken_Deterministic() {
        String token = "c4a781b0-7dec-41d0-a765-00a0c91e6bf6";
        String hash1 = GuestCredentialService.hashToken(token);
        String hash2 = GuestCredentialService.hashToken(token);

        assertNotNull(hash1);
        assertEquals(64, hash1.length());
        assertEquals(hash1, hash2);
        assertTrue(hash1.matches("^[0-9a-f]{64}$"));

        assertThrows(IllegalArgumentException.class, () -> GuestCredentialService.hashToken(null));
        assertThrows(IllegalArgumentException.class, () -> GuestCredentialService.hashToken("   "));
    }

    @Test
    @DisplayName("findValidPlayerByToken: returns player and updates lastUsedAt when credential is valid")
    void testFindValidPlayerByToken_Success() {
        String token = UUID.randomUUID().toString();
        String hash = GuestCredentialService.hashToken(token);

        Player player = new Player(UUID.randomUUID(), "Racer1", "car-1", Player.AccountType.GUEST);
        GuestCredential credential = new GuestCredential(UUID.randomUUID(), player, hash, OffsetDateTime.now());

        when(guestCredentialRepository.findValidWithPlayer(eq(hash), any(OffsetDateTime.class)))
                .thenReturn(Optional.of(credential));

        Optional<Player> result = guestCredentialService.findValidPlayerByToken(token);

        assertTrue(result.isPresent());
        assertEquals(player.getPlayerId(), result.get().getPlayerId());
        verify(guestCredentialRepository).updateLastUsedAt(eq(credential.getCredentialId()), any(OffsetDateTime.class));
    }

    @Test
    @DisplayName("findValidPlayerByToken: returns empty when credential not found, expired or revoked")
    void testFindValidPlayerByToken_NotFoundOrInvalid() {
        String token = UUID.randomUUID().toString();
        String hash = GuestCredentialService.hashToken(token);

        when(guestCredentialRepository.findValidWithPlayer(eq(hash), any(OffsetDateTime.class)))
                .thenReturn(Optional.empty());

        Optional<Player> result = guestCredentialService.findValidPlayerByToken(token);

        assertTrue(result.isEmpty());
        verify(guestCredentialRepository, never()).updateLastUsedAt(any(), any());
    }

    @Test
    @DisplayName("createPlayerWithCredential: atomically persists both Player and GuestCredential")
    void testCreatePlayerWithCredential_Success() {
        String token = UUID.randomUUID().toString();
        String username = "AtomicRacer";
        String avatarId = "bolt-gt";

        when(playerRepository.existsByUsernameIgnoreCase(username)).thenReturn(false);
        when(guestCredentialRepository.existsByTokenHash(anyString())).thenReturn(false);
        when(playerRepository.existsById(any(UUID.class))).thenReturn(false);

        when(playerRepository.saveAndFlush(any(Player.class))).thenAnswer(i -> i.getArgument(0));
        when(guestCredentialRepository.saveAndFlush(any(GuestCredential.class))).thenAnswer(i -> i.getArgument(0));

        Player player = guestCredentialService.createPlayerWithCredential(username, avatarId, token);

        assertNotNull(player);
        assertNotNull(player.getPlayerId());
        assertEquals(username, player.getUsername());
        assertEquals(avatarId, player.getAvatarId());

        ArgumentCaptor<GuestCredential> credCaptor = ArgumentCaptor.forClass(GuestCredential.class);
        verify(guestCredentialRepository).saveAndFlush(credCaptor.capture());

        GuestCredential savedCred = credCaptor.getValue();
        assertEquals(player, savedCred.getPlayer());
        assertEquals(GuestCredentialService.hashToken(token), savedCred.getTokenHash());
    }

    @Test
    @DisplayName("createPlayerWithCredential: rolls back and throws DuplicateUsernameException on username collision")
    void testCreatePlayerWithCredential_UsernameCollision() {
        String token = UUID.randomUUID().toString();
        String username = "CollisionUser";

        when(playerRepository.existsByUsernameIgnoreCase(username)).thenReturn(false);
        when(guestCredentialRepository.existsByTokenHash(anyString())).thenReturn(false);
        when(playerRepository.existsById(any(UUID.class))).thenReturn(false);

        ConstraintViolationException cve = new ConstraintViolationException(
                "duplicate key", new SQLException(), "ux_players_username_lower");
        when(playerRepository.saveAndFlush(any(Player.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint ux_players_username_lower", cve));

        assertThrows(DuplicateUsernameException.class, () ->
                guestCredentialService.createPlayerWithCredential(username, null, token));

        verify(guestCredentialRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("createPlayerWithCredential: rolls back and throws DuplicateTokenException on token hash collision (no orphan player)")
    void testCreatePlayerWithCredential_TokenCollision() {
        String token = UUID.randomUUID().toString();
        String username = "SafeUser";

        when(playerRepository.existsByUsernameIgnoreCase(username)).thenReturn(false);
        when(guestCredentialRepository.existsByTokenHash(anyString())).thenReturn(false);
        when(playerRepository.existsById(any(UUID.class))).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class))).thenAnswer(i -> i.getArgument(0));

        ConstraintViolationException cve = new ConstraintViolationException(
                "duplicate key", new SQLException(), "ux_guest_credentials_token_hash");
        when(guestCredentialRepository.saveAndFlush(any(GuestCredential.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint ux_guest_credentials_token_hash", cve));

        assertThrows(DuplicateTokenException.class, () ->
                guestCredentialService.createPlayerWithCredential(username, null, token));
    }
}

