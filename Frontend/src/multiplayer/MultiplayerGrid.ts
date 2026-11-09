/**
 * Nitro Rush — Multiplayer Starting Grid Generator
 *
 * Mathematically mirrors Backend MultiplayerGridConfig.java.
 * Staggers up to 8 grid slots behind Checkpoint 0 with longitudinal row spacing
 * of 60px and alternating lateral offset of +/-28px.
 */

export interface MultiplayerGridSlot {
  slot: string; // 'P1'..'P8'
  x: number;
  y: number;
  angle: number;
}

export class MultiplayerGrid {
  public static readonly MAX_GRID_SLOTS = 8;
  public static readonly BASE_DISTANCE_BEHIND_CP0 = 90.0;
  public static readonly ROW_SPACING = 60.0;
  public static readonly LATERAL_OFFSET = 28.0;

  /**
   * Generates 8 staggered starting positions aligned to Checkpoint 0 of a circuit.
   */
  public static generateGrid(cp0: { x: number; y: number; angle: number }): MultiplayerGridSlot[] {
    const cos = Math.cos(cp0.angle);
    const sin = Math.sin(cp0.angle);
    const normX = -sin;
    const normY = cos;

    const slots: MultiplayerGridSlot[] = [];

    for (let i = 0; i < this.MAX_GRID_SLOTS; i++) {
      const slotId = `P${i + 1}`;
      const dLong = this.BASE_DISTANCE_BEHIND_CP0 + (i * this.ROW_SPACING);
      const dLat = (i % 2 === 0) ? -this.LATERAL_OFFSET : this.LATERAL_OFFSET;

      const x = cp0.x - (dLong * cos) + (dLat * normX);
      const y = cp0.y - (dLong * sin) + (dLat * normY);

      slots.push({
        slot: slotId,
        x,
        y,
        angle: cp0.angle,
      });
    }

    return slots;
  }
}

