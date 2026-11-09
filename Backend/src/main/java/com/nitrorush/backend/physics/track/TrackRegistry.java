package com.nitrorush.backend.physics.track;

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
 * Thread-safe registry that loads and caches all 9 circuit definitions from classpath.
 */
@Component
public class TrackRegistry {

    private static final Logger log = LoggerFactory.getLogger(TrackRegistry.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private static final Map<String, TrackDefinition> STATIC_TRACKS = new ConcurrentHashMap<>();
    private final Map<String, TrackDefinition> tracks = new ConcurrentHashMap<>();

    private static final String[] KNOWN_TRACK_IDS = {
            "coastal-rush", "city-nights", "mountain-pass", "desert-heat",
            "forest-trail", "snow-peaks", "volcano-run", "rural-village", "space-station"
    };

    static {
        loadStaticTracks();
    }

    private static void loadStaticTracks() {
        for (String id : KNOWN_TRACK_IDS) {
            String path = "/tracks/" + id + ".json";
            try (InputStream is = TrackRegistry.class.getResourceAsStream(path)) {
                if (is != null) {
                    TrackDefinition def = mapper.readValue(is, TrackDefinition.class);
                    STATIC_TRACKS.put(def.getId(), def);
                } else {
                    log.warn("Track JSON resource not found: {}", path);
                }
            } catch (Exception e) {
                log.error("Failed to load static track JSON: {}", path, e);
            }
        }
    }

    @PostConstruct
    public void init() {
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath*:tracks/*.json");
            for (Resource r : resources) {
                try (InputStream is = r.getInputStream()) {
                    TrackDefinition def = mapper.readValue(is, TrackDefinition.class);
                    tracks.put(def.getId(), def);
                    STATIC_TRACKS.put(def.getId(), def);
                    log.info("Registered track definition: {}", def.getId());
                }
            }
        } catch (Exception e) {
            log.error("Failed to discover track definitions on classpath", e);
        }
        tracks.putAll(STATIC_TRACKS);
    }

    public static TrackDefinition getStatic(String trackId) {
        TrackDefinition def = STATIC_TRACKS.get(trackId);
        if (def == null) {
            return STATIC_TRACKS.get("coastal-rush"); // fallback
        }
        return def;
    }

    public TrackDefinition getTrack(String trackId) {
        TrackDefinition def = tracks.get(trackId);
        if (def == null) {
            def = STATIC_TRACKS.get(trackId);
        }
        if (def == null) {
            return getStatic("coastal-rush");
        }
        return def;
    }

    public Set<String> getAllTrackIds() {
        return Collections.unmodifiableSet(new TreeSet<>(STATIC_TRACKS.keySet()));
    }
}

