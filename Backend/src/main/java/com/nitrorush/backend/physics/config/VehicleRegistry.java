package com.nitrorush.backend.physics.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe registry that loads and caches all vehicle configurations from classpath.
 */
@Component
public class VehicleRegistry {

    private static final Logger log = LoggerFactory.getLogger(VehicleRegistry.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private static final Map<String, VehicleConfig> STATIC_VEHICLES = new ConcurrentHashMap<>();
    private final Map<String, VehicleConfig> vehicles = new ConcurrentHashMap<>();

    private static final String[] KNOWN_VEHICLE_IDS = {
            "bolt-gt", "viper-r", "rally-apex", "titan-v8"
    };

    static {
        loadStaticVehicles();
    }

    private static void loadStaticVehicles() {
        for (String id : KNOWN_VEHICLE_IDS) {
            String path = "/vehicles/" + id + ".json";
            try (InputStream is = VehicleRegistry.class.getResourceAsStream(path)) {
                if (is != null) {
                    VehicleConfig cfg = mapper.readValue(is, VehicleConfig.class);
                    STATIC_VEHICLES.put(cfg.getId(), cfg);
                } else {
                    log.warn("Vehicle JSON resource not found: {}", path);
                }
            } catch (Exception e) {
                log.error("Failed to load static vehicle JSON: {}", path, e);
            }
        }
    }

    @PostConstruct
    public void init() {
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath*:vehicles/*.json");
            for (Resource r : resources) {
                try (InputStream is = r.getInputStream()) {
                    VehicleConfig cfg = mapper.readValue(is, VehicleConfig.class);
                    vehicles.put(cfg.getId(), cfg);
                    STATIC_VEHICLES.put(cfg.getId(), cfg);
                    log.info("Registered vehicle config: {}", cfg.getId());
                }
            }
        } catch (Exception e) {
            log.error("Failed to discover vehicle configs on classpath", e);
        }
        // Ensure static vehicles are available in instance map as well
        vehicles.putAll(STATIC_VEHICLES);
    }

    public static VehicleConfig getStatic(String vehicleId) {
        VehicleConfig cfg = STATIC_VEHICLES.get(vehicleId);
        if (cfg == null) {
            return STATIC_VEHICLES.get("bolt-gt"); // fallback
        }
        return cfg;
    }

    public VehicleConfig getVehicle(String vehicleId) {
        VehicleConfig cfg = vehicles.get(vehicleId);
        if (cfg == null) {
            cfg = STATIC_VEHICLES.get(vehicleId);
        }
        if (cfg == null) {
            return getStatic("bolt-gt");
        }
        return cfg;
    }

    public Set<String> getAllVehicleIds() {
        return Collections.unmodifiableSet(new TreeSet<>(STATIC_VEHICLES.keySet()));
    }
}

