package com.nitrorush.backend.physics.model;

/**
 * Surface types present across the Nitro Rush circuits.
 */
public enum SurfaceType {
    ASPHALT("asphalt"),
    SAND("sand"),
    ICE("ice"),
    SNOW("snow"),
    DIRT("dirt"),
    COBBLESTONE("cobblestone"),
    METAL("metal"),
    BASALT("basalt");

    private final String id;

    SurfaceType(String id) {
        this.id = id;
    }

    public String getId() {
        return id;
    }

    public static SurfaceType fromString(String text) {
        if (text == null) {
            return ASPHALT;
        }
        for (SurfaceType b : SurfaceType.values()) {
            if (b.id.equalsIgnoreCase(text)) {
                return b;
            }
        }
        return ASPHALT;
    }
}

