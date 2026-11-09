import Phaser from 'phaser';

export interface Checkpoint {
  index: number;
  x: number;
  y: number;
  angle: number; // direction of track in radians
  width: number;
}

export interface GridSlot {
  slot: string; // 'P1' | 'P2' | 'P3' | 'P4'
  x: number;
  y: number;
  angle: number;
}

export interface TrackGeometryData {
  trackId: string;
  worldWidth: number;
  worldHeight: number;
  roadWidth: number;
  waypoints: Phaser.Math.Vector2[];
  trackPath: Phaser.Curves.Spline;
  spacedPoints: Phaser.Math.Vector2[];
  checkpoints: Checkpoint[];
  startGridPositions: GridSlot[];
  startPosition: GridSlot;
}

/**
 * Control waypoints definitions for all 9 Nitro Rush tracks.
 * Each circuit is a distinct, non-overlapping closed loop with an official start/finish straight.
 */
const TRACK_CONTROL_POINTS: Record<string, { worldW: number; worldH: number; roadW: number; points: [number, number][] }> = {
  'coastal-rush': {
    worldW: 3200,
    worldH: 2400,
    roadW: 140,
    points: [
      [950, 1920],   // CP 0: Start / Finish Line
      [1400, 1920],  // East beach straight
      [1850, 1920],  // High-speed beach straight
      [2350, 1840],  // Turn 1 entry
      [2680, 1580],  // Turn 1 apex
      [2650, 1150],  // Coastal cliff climb
      [2500, 780],   // Cliff sweep entry
      [2150, 520],   // Ocean overlook turn
      [1650, 440],   // North straightaway
      [1150, 480],   // North technical section
      [760, 680],    // Hairpin entry
      [560, 980],    // Hairpin apex
      [740, 1260],   // S-bend transition
      [920, 1480],   // Chicane
      [750, 1720],   // Final corner onto main straight
      [700, 1920],   // Main straight approach
      [950, 1920],   // Loop back
    ],
  },

  'city-nights': {
    worldW: 3200,
    worldH: 2400,
    roadW: 140,
    points: [
      [1000, 1950],  // CP 0: Start / Finish Downtown Boulevard
      [1450, 1950],  // South avenue straight
      [1950, 1950],  // Neon flyover approach
      [2350, 1800],  // 90° turn into east skyscraper canyon
      [2500, 1450],  // East boulevard straight
      [2450, 1000],  // Upper east corner
      [2150, 850],   // Midtown elevated flyover
      [1800, 650],   // Financial district sweep
      [1350, 500],   // North highway straight
      [850, 500],    // North highway terminus
      [550, 750],    // 90° sharp turn into west avenue
      [550, 1200],   // West skyscraper canyon
      [750, 1450],   // Downtown chicane entry
      [900, 1650],   // Plaza chicane apex
      [700, 1850],   // Turn onto main straight
      [750, 1950],   // Main straight approach
      [1000, 1950],  // Loop back
    ],
  },

  'mountain-pass': {
    worldW: 3200,
    worldH: 2400,
    roadW: 130,
    points: [
      [950, 2000],   // CP 0: Lower Valley Straight Start/Finish
      [1450, 2000],  // Valley speed run
      [1950, 1900],  // Gorge ascent entry
      [2450, 1700],  // Mountain ledge climb
      [2650, 1350],  // East cliff wall
      [2500, 950],   // Alpine switchback 1
      [2100, 800],   // High ledge traverse
      [1700, 550],   // Ridge climb
      [1250, 480],   // Summit pass straight
      [750, 550],    // Western ridge hairpin entry
      [550, 850],    // Treacherous switchback 2 apex
      [650, 1200],   // Downhill canyon descent
      [1050, 1350],  // Mountain S-curve entry
      [1350, 1550],  // Mountain S-curve exit
      [1050, 1780],  // Final hairpin into valley
      [700, 2000],   // Approach straight
      [950, 2000],   // Loop back
    ],
  },

  'desert-heat': {
    worldW: 3400,
    worldH: 2400,
    roadW: 150,
    points: [
      [1000, 1950],  // CP 0: Great Salt Flat Straight Start/Finish
      [1550, 1950],  // Salt flat full-throttle straight
      [2100, 1950],  // Dune straight extension
      [2600, 1800],  // Massive high-speed dune bank entry
      [2950, 1450],  // East dune sweeper
      [2900, 1000],  // Canyon entrance
      [2600, 650],   // Red sandstone canyon bend
      [2050, 500],   // North desert highway
      [1450, 460],   // High-speed salt basin straight
      [850, 520],    // West dune bend
      [550, 800],    // Dune crest turn
      [520, 1200],   // Scorched sand sweeper
      [800, 1500],   // Cactus canyon chicane
      [650, 1800],   // Final dune bank onto salt flat
      [720, 1950],   // Salt flat approach
      [1000, 1950],  // Loop back
    ],
  },

  'forest-trail': {
    worldW: 3200,
    worldH: 2400,
    roadW: 135,
    points: [
      [1000, 1900],  // CP 0: Ancient Redwood Straight Start/Finish
      [1500, 1900],  // Forest floor straightaway
      [2050, 1850],  // Turn 1 into Mossy Grove
      [2450, 1650],  // Giant redwood sweeper
      [2650, 1300],  // Canopy climb
      [2400, 1000],  // Technical chicane entry
      [2600, 750],   // Technical chicane exit
      [2250, 520],   // River bridge approach
      [1750, 480],   // Suspension bridge straight
      [1250, 480],   // Suspension bridge exit
      [800, 600],    // River bend hairpin entry
      [550, 850],    // River bend apex
      [750, 1180],   // Shadowed glade S-curve
      [1050, 1400],  // Fern valley chicane
      [800, 1680],   // Final tree-lined curve
      [700, 1900],   // Straight approach
      [1000, 1900],  // Loop back
    ],
  },

  'snow-peaks': {
    worldW: 3200,
    worldH: 2400,
    roadW: 145,
    points: [
      [1000, 1920],  // CP 0: Glacial Runway Start/Finish
      [1550, 1920],  // High-speed ice straight
      [2150, 1850],  // Turn 1 into Frozen Fjord
      [2600, 1600],  // Ice sheet sweeper
      [2750, 1150],  // Blizzard ridge climb
      [2500, 750],   // Glacial crest turn
      [2000, 520],   // Frozen lake traverse
      [1450, 480],   // High-speed lake straight
      [900, 550],    // Snow squall hairpin entry
      [550, 800],    // Snow squall hairpin apex
      [550, 1200],   // Ice cavern wall
      [800, 1450],   // Slick chicane entry
      [1050, 1650],  // Slick chicane exit
      [750, 1820],   // Corner onto glacial runway
      [720, 1920],   // Main runway approach
      [1000, 1920],  // Loop back
    ],
  },

  'volcano-run': {
    worldW: 3400,
    worldH: 2400,
    roadW: 140,
    points: [
      [1000, 1950],  // CP 0: Magma Bridge Straight Start/Finish
      [1550, 1950],  // Steel grating bridge straight
      [2150, 1900],  // Turn 1 onto Caldera Rim
      [2650, 1650],  // Obsidian basalt curve
      [2850, 1250],  // Volcanic ridge climb
      [2750, 800],   // High magma overlook
      [2350, 520],   // Fissure sweep
      [1750, 460],   // Ash plateau straight
      [1150, 500],   // Ash plateau straight end
      [750, 680],    // Caldera cavern hairpin entry
      [520, 950],    // Cavern hairpin apex
      [550, 1300],   // Boiling lava pool chicane
      [850, 1500],   // Basalt S-bend
      [680, 1750],   // Corner onto magma bridge
      [720, 1950],   // Magma bridge approach
      [1000, 1950],  // Loop back
    ],
  },

  'rural-village': {
    worldW: 3200,
    worldH: 2400,
    roadW: 135,
    points: [
      [950, 1900],   // CP 0: Pastoral Valley Straight Start/Finish
      [1500, 1900],  // Valley farmland straight
      [2050, 1850],  // Rolling hill turn 1
      [2500, 1600],  // Meadow sweeper
      [2650, 1200],  // Vineyard curve
      [2450, 800],   // Village outskirts approach
      [1950, 550],   // North wheat field straight
      [1400, 500],   // Farmland straight end
      [850, 600],    // Cobblestone town plaza entry
      [600, 850],    // Village square 90° chicane
      [850, 1100],   // Cobblestone archway
      [650, 1350],   // Old stone bridge across brook
      [850, 1600],   // Farmhouse chicane
      [700, 1800],   // Turn onto valley straight
      [700, 1900],   // Approach straight
      [950, 1900],   // Loop back
    ],
  },

  'space-station': {
    worldW: 3400,
    worldH: 2400,
    roadW: 140,
    points: [
      [1000, 1950],  // CP 0: Magnetic Velocity Tube Start/Finish
      [1600, 1950],  // High-speed mag-lev propulsion tube
      [2200, 1950],  // Orbital tube extension
      [2650, 1750],  // Turn 1 into Solar Array Wing
      [2900, 1350],  // Solar array outer ring
      [2800, 900],   // Orbital hub connector
      [2450, 650],   // Zero-gravity vacuum sweep
      [1950, 500],   // Earth overlook straight
      [1350, 460],   // High-speed orbital tube
      [800, 550],    // Docking bay hairpin entry
      [520, 850],    // Docking bay hairpin apex
      [550, 1250],   // Habitat ring sweeper
      [850, 1500],   // Energy conduit chicane entry
      [650, 1750],   // Conduit exit onto mag tube
      [720, 1950],   // Velocity tube approach
      [1000, 1950],  // Loop back
    ],
  },
};

export class TrackGeometry {
  /**
   * Builds dense spline geometry, checkpoints, and starting grid slots for any of the 9 tracks
   */
  public static getTrackGeometry(trackId: string): TrackGeometryData {
    const raw = TRACK_CONTROL_POINTS[trackId] || TRACK_CONTROL_POINTS['coastal-rush'];
    const waypoints = raw.points.map(([x, y]) => new Phaser.Math.Vector2(x, y));

    // Build closed spline
    const trackPath = new Phaser.Curves.Spline(waypoints);
    const spacedPoints = trackPath.getSpacedPoints(240);

    // Start / Finish Line is at spacedPoints[0]
    const p0 = spacedPoints[0];
    const p1 = spacedPoints[1];
    const startAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    // Tangent and normal vectors along the start straight
    const tanX = Math.cos(startAngle);
    const tanY = Math.sin(startAngle);
    const normX = -tanY;
    const normY = tanX;

    // Staggered 4-car starting grid slots cleanly aligned behind the start line
    const startGridPositions: GridSlot[] = [
      {
        slot: 'P1',
        x: p0.x - tanX * 90 - normX * 28,
        y: p0.y - tanY * 90 - normY * 28,
        angle: startAngle,
      },
      {
        slot: 'P2',
        x: p0.x - tanX * 150 + normX * 28,
        y: p0.y - tanY * 150 + normY * 28,
        angle: startAngle,
      },
      {
        slot: 'P3',
        x: p0.x - tanX * 210 - normX * 28,
        y: p0.y - tanY * 210 - normY * 28,
        angle: startAngle,
      },
      {
        slot: 'P4',
        x: p0.x - tanX * 270 + normX * 28,
        y: p0.y - tanY * 270 + normY * 28,
        angle: startAngle,
      },
    ];

    // Build 12 ordered checkpoints around the circuit
    const checkpoints: Checkpoint[] = [];
    const numCheckpoints = 12;
    const step = Math.floor(spacedPoints.length / numCheckpoints); // 20

    for (let k = 0; k < numCheckpoints; k++) {
      const idx = k * step;
      const cpPoint = spacedPoints[idx];
      const nextIdx = (idx + 1) % spacedPoints.length;
      const nextPoint = spacedPoints[nextIdx];
      const angle = Math.atan2(nextPoint.y - cpPoint.y, nextPoint.x - cpPoint.x);

      checkpoints.push({
        index: k,
        x: cpPoint.x,
        y: cpPoint.y,
        angle: k === 0 ? startAngle : angle,
        width: raw.roadW,
      });
    }

    return {
      trackId,
      worldWidth: raw.worldW,
      worldHeight: raw.worldH,
      roadWidth: raw.roadW,
      waypoints,
      trackPath,
      spacedPoints,
      checkpoints,
      startGridPositions,
      startPosition: startGridPositions[0],
    };
  }
}

