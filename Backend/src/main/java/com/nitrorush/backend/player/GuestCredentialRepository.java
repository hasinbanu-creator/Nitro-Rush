package com.nitrorush.backend.player;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for the {@link GuestCredential} entity.
 */
@Repository
public interface GuestCredentialRepository extends JpaRepository<GuestCredential, UUID> {

    /**
     * Finds a valid (unrevoked and unexpired) credential with its associated player eagerly fetched.
     *
     * @param tokenHash SHA-256 hash of the bearer token
     * @param now       current evaluation time
     * @return Optional containing the active credential with player initialized, if found
     */
    @Query("""
        SELECT c FROM GuestCredential c
        JOIN FETCH c.player
        WHERE c.tokenHash = :tokenHash
          AND c.revokedAt IS NULL
          AND (c.expiresAt IS NULL OR c.expiresAt > :now)
    """)
    Optional<GuestCredential> findValidWithPlayer(
            @Param("tokenHash") String tokenHash,
            @Param("now") OffsetDateTime now);

    /**
     * Looks up any credential by exact token hash regardless of validity.
     *
     * @param tokenHash SHA-256 hash of the bearer token
     * @return Optional containing the credential if registered
     */
    Optional<GuestCredential> findByTokenHash(String tokenHash);

    /**
     * Checks if a token hash is already registered.
     *
     * @param tokenHash SHA-256 hash of the bearer token
     * @return true if token hash exists in credentials
     */
    boolean existsByTokenHash(String tokenHash);

    /**
     * Safely updates the last_used_at timestamp upon session recovery.
     *
     * @param credentialId unique credential identifier
     * @param now          timestamp of usage
     */
    @Modifying
    @Query("UPDATE GuestCredential c SET c.lastUsedAt = :now WHERE c.credentialId = :credentialId")
    void updateLastUsedAt(@Param("credentialId") UUID credentialId, @Param("now") OffsetDateTime now);
}

