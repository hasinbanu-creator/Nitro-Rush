package com.nitrorush.backend.player;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("PlayerService Unit Tests")
class PlayerServiceTest {

    @Mock
    private PlayerRepository playerRepository;

    private PlayerService playerService;

    @BeforeEach
    void setUp() {
        playerService = new PlayerService(playerRepository);
    }

    // ==================== createGuestPlayer ====================

    @Test
    @DisplayName("createGuestPlayer: successfully creates guest player with UUID and GUEST account type")
    void testCreateGuestPlayer_Success() {
        when(playerRepository.existsByUsernameIgnoreCase("SpeedRacer")).thenReturn(false);
        when(playerRepository.existsById(any(UUID.class))).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Player player = playerService.createGuestPlayer("SpeedRacer", "car-bolt");

        assertNotNull(player);
        assertNotNull(player.getPlayerId());
        assertEquals("SpeedRacer", player.getUsername());
        assertEquals("car-bolt", player.getAvatarId());
        assertEquals(Player.AccountType.GUEST, player.getAccountType());
        assertNotNull(player.getCreatedAt());

        verify(playerRepository).existsByUsernameIgnoreCase("SpeedRacer");
        verify(playerRepository).saveAndFlush(player);
    }

    @Test
    @DisplayName("createGuestPlayer: null or blank username throws IllegalArgumentException")
    void testCreateGuestPlayer_NullOrBlankUsername() {
        assertThrows(IllegalArgumentException.class, () -> playerService.createGuestPlayer(null, "car-1"));
        assertThrows(IllegalArgumentException.class, () -> playerService.createGuestPlayer("", "car-1"));
        assertThrows(IllegalArgumentException.class, () -> playerService.createGuestPlayer("   ", "car-1"));
        verifyNoInteractions(playerRepository);
    }

    @Test
    @DisplayName("createGuestPlayer: username exceeding 16 chars throws IllegalArgumentException")
    void testCreateGuestPlayer_UsernameTooLong() {
        assertThrows(IllegalArgumentException.class, () -> playerService.createGuestPlayer("12345678901234567", "car-1"));
        verifyNoInteractions(playerRepository);
    }

    @Test
    @DisplayName("createGuestPlayer: avatarId exceeding 50 chars throws IllegalArgumentException")
    void testCreateGuestPlayer_AvatarIdTooLong() {
        String longAvatar = "a".repeat(51);
        assertThrows(IllegalArgumentException.class, () -> playerService.createGuestPlayer("ValidUser", longAvatar));
        verifyNoInteractions(playerRepository);
    }

    @Test
    @DisplayName("createGuestPlayer: duplicate username detected in pre-check throws DuplicateUsernameException")
    void testCreateGuestPlayer_PreCheckDuplicateThrows() {
        when(playerRepository.existsByUsernameIgnoreCase("SpeedRacer")).thenReturn(true);

        DuplicateUsernameException ex = assertThrows(DuplicateUsernameException.class,
                () -> playerService.createGuestPlayer("SpeedRacer", "car-1"));
        assertTrue(ex.getMessage().contains("SpeedRacer"));
        verify(playerRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("createGuestPlayer: concurrent race condition triggers DataIntegrityViolationException and translates to DuplicateUsernameException")
    void testCreateGuestPlayer_DataIntegrityViolationTranslates() {
        when(playerRepository.existsByUsernameIgnoreCase("SpeedRacer")).thenReturn(false);
        when(playerRepository.existsById(any(UUID.class))).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint ux_players_username_lower"));

        DuplicateUsernameException ex = assertThrows(DuplicateUsernameException.class,
                () -> playerService.createGuestPlayer("SpeedRacer", "car-1"));
        assertTrue(ex.getMessage().contains("SpeedRacer"));
        assertNotNull(ex.getCause());
    }

    @Test
    @DisplayName("createGuestPlayer: other DataIntegrityViolationException is rethrown without being reported as duplicate username")
    void testCreateGuestPlayer_OtherDataIntegrityViolationRethrown() {
        when(playerRepository.existsByUsernameIgnoreCase("SpeedRacer")).thenReturn(false);
        when(playerRepository.existsById(any(UUID.class))).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class)))
                .thenThrow(new DataIntegrityViolationException("violates check constraint chk_players_account_type"));

        DataIntegrityViolationException ex = assertThrows(DataIntegrityViolationException.class,
                () -> playerService.createGuestPlayer("SpeedRacer", "car-1"));
        assertTrue(ex.getMessage().contains("chk_players_account_type"));
    }

    // ==================== getPlayerById ====================

    @Test
    @DisplayName("getPlayerById: returns player when exists")
    void testGetPlayerById_Found() {
        UUID id = UUID.randomUUID();
        Player expected = new Player(id, "RacerOne", "car-1", Player.AccountType.GUEST);
        when(playerRepository.findById(id)).thenReturn(Optional.of(expected));

        Optional<Player> result = playerService.getPlayerById(id);
        assertTrue(result.isPresent());
        assertEquals("RacerOne", result.get().getUsername());
    }

    @Test
    @DisplayName("getPlayerById: returns empty Optional when not found or null ID")
    void testGetPlayerById_NotFound() {
        UUID id = UUID.randomUUID();
        when(playerRepository.findById(id)).thenReturn(Optional.empty());

        Optional<Player> result = playerService.getPlayerById(id);
        assertTrue(result.isEmpty());

        Optional<Player> nullResult = playerService.getPlayerById(null);
        assertTrue(nullResult.isEmpty());
    }

    // ==================== isUsernameAvailable ====================

    @Test
    @DisplayName("isUsernameAvailable: case-insensitive check returns expected availability")
    void testIsUsernameAvailable() {
        when(playerRepository.existsByUsernameIgnoreCase("Available")).thenReturn(false);
        when(playerRepository.existsByUsernameIgnoreCase("Taken")).thenReturn(true);

        assertTrue(playerService.isUsernameAvailable("Available"));
        assertFalse(playerService.isUsernameAvailable("Taken"));
        assertFalse(playerService.isUsernameAvailable(null));
        assertFalse(playerService.isUsernameAvailable(""));
        assertFalse(playerService.isUsernameAvailable("12345678901234567"));
    }

    // ==================== updatePlayerProfile ====================

    @Test
    @DisplayName("updatePlayerProfile: successfully updates username and avatar preserving id, type and createdAt")
    void testUpdatePlayerProfile_Success() {
        UUID id = UUID.randomUUID();
        OffsetDateTime created = OffsetDateTime.now().minusDays(2);
        Player existing = new Player(id, "OldName", "old-avatar", Player.AccountType.GUEST, created);

        when(playerRepository.findById(id)).thenReturn(Optional.of(existing));
        when(playerRepository.existsByUsernameIgnoreCase("NewName")).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Player updated = playerService.updatePlayerProfile(id, "NewName", "new-avatar");

        assertEquals(id, updated.getPlayerId());
        assertEquals("NewName", updated.getUsername());
        assertEquals("new-avatar", updated.getAvatarId());
        assertEquals(Player.AccountType.GUEST, updated.getAccountType());
        assertEquals(created, updated.getCreatedAt());
    }

    @Test
    @DisplayName("updatePlayerProfile: allows player to retain their own username with identical or changed casing")
    void testUpdatePlayerProfile_RetainSameUsername() {
        UUID id = UUID.randomUUID();
        OffsetDateTime created = OffsetDateTime.now().minusDays(1);
        Player existing = new Player(id, "speedracer", "car-1", Player.AccountType.GUEST, created);

        when(playerRepository.findById(id)).thenReturn(Optional.of(existing));
        when(playerRepository.saveAndFlush(any(Player.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // Change casing to "SpeedRacer"
        Player updated = playerService.updatePlayerProfile(id, "SpeedRacer", null);

        assertEquals("SpeedRacer", updated.getUsername());
        assertEquals("car-1", updated.getAvatarId()); // Untouched because avatarId was null
        verify(playerRepository, never()).existsByUsernameIgnoreCase(anyString());
    }

    @Test
    @DisplayName("updatePlayerProfile: rejects username used by another player")
    void testUpdatePlayerProfile_RejectUsernameUsedByOther() {
        UUID id = UUID.randomUUID();
        Player existing = new Player(id, "PlayerA", "car-1", Player.AccountType.GUEST);

        when(playerRepository.findById(id)).thenReturn(Optional.of(existing));
        when(playerRepository.existsByUsernameIgnoreCase("PlayerB")).thenReturn(true);

        assertThrows(DuplicateUsernameException.class,
                () -> playerService.updatePlayerProfile(id, "PlayerB", "car-1"));
        verify(playerRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("updatePlayerProfile: throws PlayerNotFoundException if player does not exist")
    void testUpdatePlayerProfile_NotFound() {
        UUID id = UUID.randomUUID();
        when(playerRepository.findById(id)).thenReturn(Optional.empty());

        assertThrows(PlayerNotFoundException.class,
                () -> playerService.updatePlayerProfile(id, "NewName", "car-1"));
    }

    @Test
    @DisplayName("updatePlayerProfile: concurrent uniqueness conflict throws DuplicateUsernameException")
    void testUpdatePlayerProfile_ConcurrentConflictTranslates() {
        UUID id = UUID.randomUUID();
        Player existing = new Player(id, "PlayerA", "car-1", Player.AccountType.GUEST);

        when(playerRepository.findById(id)).thenReturn(Optional.of(existing));
        when(playerRepository.existsByUsernameIgnoreCase("NewName")).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint ux_players_username_lower"));

        DuplicateUsernameException ex = assertThrows(DuplicateUsernameException.class,
                () -> playerService.updatePlayerProfile(id, "NewName", "car-1"));
        assertTrue(ex.getMessage().contains("NewName"));
    }

    @Test
    @DisplayName("updatePlayerProfile: other DataIntegrityViolationException is rethrown without being reported as duplicate username")
    void testUpdatePlayerProfile_OtherDataIntegrityViolationRethrown() {
        UUID id = UUID.randomUUID();
        Player existing = new Player(id, "PlayerA", "car-1", Player.AccountType.GUEST);

        when(playerRepository.findById(id)).thenReturn(Optional.of(existing));
        when(playerRepository.existsByUsernameIgnoreCase("NewName")).thenReturn(false);
        when(playerRepository.saveAndFlush(any(Player.class)))
                .thenThrow(new DataIntegrityViolationException("violates check constraint chk_players_account_type"));

        DataIntegrityViolationException ex = assertThrows(DataIntegrityViolationException.class,
                () -> playerService.updatePlayerProfile(id, "NewName", "car-1"));
        assertTrue(ex.getMessage().contains("chk_players_account_type"));
    }
}

