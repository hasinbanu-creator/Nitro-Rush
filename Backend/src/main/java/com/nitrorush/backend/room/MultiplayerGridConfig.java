package com.nitrorush.backend.room;

import com.nitrorush.backend.physics.track.GridSlot;
import com.nitrorush.backend.physics.track.TrackCheckpoint;
import com.nitrorush.backend.physics.track.TrackDefinition;

import java.util.ArrayList;
import java.util.List;

/**
 * Dedicated multiplayer 8-slot staggered starting grid generator.
 * Places 8 vehicles in two parallel staggered columns behind Checkpoint 0
 * preserving track centerline alignment and collision-free clearance (82px diagonal spacing).
 */
public class MultiplayerGridConfig {

    public static final int MAX_GRID_SLOTS = 8;
    public static final double BASE_DISTANCE_BEHIND_CP0 = 90.0;
    public static final double ROW_SPACING = 60.0;
    public static final double LATERAL_OFFSET = 28.0;

    /**
     * Generates standard 8-slot starting positions for a given circuit.
     */
    public static List<GridSlot> generateGrid(TrackDefinition track) {
        if (track == null || track.getCheckpoints() == null || track.getCheckpoints().isEmpty()) {
            throw new IllegalArgumentException("Track must have at least one checkpoint to build grid");
        }

        TrackCheckpoint cp0 = track.getCheckpoints().get(0);
        double cpX = cp0.getX();
        double cpY = cp0.getY();
        double angle = cp0.getAngle();

        double cos = Math.cos(angle);
        double sin = Math.sin(angle);
        double normX = -sin;
        double normY = cos;

        List<GridSlot> slots = new ArrayList<>(MAX_GRID_SLOTS);

        for (int i = 0; i < MAX_GRID_SLOTS; i++) {
            String slotId = "P" + (i + 1);
            double dLong = BASE_DISTANCE_BEHIND_CP0 + (i * ROW_SPACING);
            double dLat = (i % 2 == 0) ? -LATERAL_OFFSET : LATERAL_OFFSET;

            double x = cpX - (dLong * cos) + (dLat * normX);
            double y = cpY - (dLong * sin) + (dLat * normY);

            slots.add(new GridSlot(slotId, x, y, angle));
        }

        return slots;
    }

    /**
     * Retrieves specific slot position for index (0 to 7) on the track.
     */
    public static GridSlot getSlot(TrackDefinition track, int slotIndex) {
        if (slotIndex < 0 || slotIndex >= MAX_GRID_SLOTS) {
            throw new IndexOutOfBoundsException("Slot index must be between 0 and 7, got: " + slotIndex);
        }
        return generateGrid(track).get(slotIndex);
    }
}

