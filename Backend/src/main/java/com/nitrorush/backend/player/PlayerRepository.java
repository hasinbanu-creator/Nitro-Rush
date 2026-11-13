package com.nitrorush.backend.player;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for the {@link Player} entity.
 * Provides standard CRUD operations and derived query methods for case-insensitive
 * player lookup and existence checks.
 */
@Repository
public interface PlayerRepository extends JpaRepository<Player, UUID> {

    /**
     * Finds a player by their username using case-insensitive matching.
     *
     * @param username the username to look up
     * @return an {@link Optional} containing the matching player, or empty if not found
     */
    Optional<Player> findByUsernameIgnoreCase(String username);

    /**
     * Checks whether a player with the given username already exists using case-insensitive matching.
     *
     * @param username the username to check
     * @return {@code true} if a player exists with the given username (case-insensitive), {@code false} otherwise
     */
    boolean existsByUsernameIgnoreCase(String username);
}
