package com.nitrorush.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Nitro Rush — Real-Time Multiplayer Arcade Racing Backend
 * Milestone 8.1 - 8.3: Spring Boot, Authoritative Physics & Room Lifecycle
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class NitroRushApplication {

    public static void main(String[] args) {
        SpringApplication.run(NitroRushApplication.class, args);
    }
}
