import type { DifficultyId } from '../state/SelectionState';

/** Shared world boundary margin (pixels from canvas boundary) for all vehicles */
export const WORLD_BORDER_MARGIN = 50;

/** Restitution coefficient applied when rebounding off canvas world borders */
export const WORLD_BORDER_RESTITUTION = 0.32;

export interface CircuitPoint {
  x: number;
  y: number;
}

export interface TrackPhysicsConfig {
  gripMultiplier: number;
  accelMultiplier: number;
  brakingMultiplier: number;
  offRoadPenalty: number;
  offRoadDrag: number;
  driftEaseFactor: number;
  surfaceType: 'asphalt' | 'sand' | 'ice' | 'snow' | 'dirt' | 'cobblestone' | 'metal' | 'basalt';
}

export interface TrackVisualConfig {
  roadColor: number;
  roadInnerColor: number;
  curbColor1: number;
  curbColor2: number;
  edgeGlowColor: number;
  centerLineColor: number;
  barrierColor: number;
}

export interface TrackConfig {
  id: string;
  name: string;
  environment: string;
  tagline: string;
  description: string;
  recommendedDifficulty: DifficultyId;
  length: string;
  laps: number;
  surface: string;
  accentColor: number;
  secondaryColor: number;
  terrainType: 'coastal' | 'city' | 'mountain' | 'desert' | 'forest' | 'snow' | 'volcano' | 'rural' | 'space';
  circuitPoints: CircuitPoint[];
  physics: TrackPhysicsConfig;
  visual: TrackVisualConfig;
}

export const TRACKS: TrackConfig[] = [
  {
    id: 'coastal-rush',
    name: 'Coastal Rush',
    environment: 'Pacific Ocean Cliffs & Turbo Highway',
    tagline: 'HIGH-SPEED OCEAN BREEZE & CLIFFSIDE CORNERS',
    description: 'Breathtaking ocean views flanked by seaside cliff overpasses, long beachfront turbo straightaways, and sweeping curves.',
    recommendedDifficulty: 'EASY',
    length: '3.6 KM',
    laps: 3,
    surface: 'Smooth Coastal Tarmac',
    accentColor: 0x00f0ff,
    secondaryColor: 0x0077b6,
    terrainType: 'coastal',
    circuitPoints: [
      { x: 0.18, y: 0.28 },
      { x: 0.45, y: 0.20 },
      { x: 0.78, y: 0.24 },
      { x: 0.84, y: 0.52 },
      { x: 0.68, y: 0.76 },
      { x: 0.40, y: 0.80 },
      { x: 0.22, y: 0.64 },
    ],
    physics: {
      gripMultiplier: 1.00,
      accelMultiplier: 1.00,
      brakingMultiplier: 1.00,
      offRoadPenalty: 0.65,
      offRoadDrag: 0.975,
      driftEaseFactor: 1.00,
      surfaceType: 'asphalt',
    },
    visual: {
      roadColor: 0x181e2b,
      roadInnerColor: 0x222a3a,
      curbColor1: 0xef4444,
      curbColor2: 0xffffff,
      edgeGlowColor: 0x00f0ff,
      centerLineColor: 0xffffff,
      barrierColor: 0xef4444,
    },
  },
  {
    id: 'city-nights',
    name: 'City Nights',
    environment: 'Cyber Metropolis & Elevated Highways',
    tagline: 'NEON SKYSCRAPERS & SHARP 90° INTERSECTIONS',
    description: 'Blistering speed through illuminated skyscraper canyons, high-velocity neon flyovers, and tight downtown grid corners.',
    recommendedDifficulty: 'MEDIUM',
    length: '4.2 KM',
    laps: 3,
    surface: 'High-Grip Urban Asphalt',
    accentColor: 0xff007f,
    secondaryColor: 0x38bdf8,
    terrainType: 'city',
    circuitPoints: [
      { x: 0.18, y: 0.22 },
      { x: 0.78, y: 0.22 },
      { x: 0.82, y: 0.44 },
      { x: 0.52, y: 0.46 },
      { x: 0.54, y: 0.76 },
      { x: 0.22, y: 0.76 },
      { x: 0.20, y: 0.50 },
      { x: 0.36, y: 0.48 },
    ],
    physics: {
      gripMultiplier: 1.04,
      accelMultiplier: 1.02,
      brakingMultiplier: 1.02,
      offRoadPenalty: 0.58,
      offRoadDrag: 0.972,
      driftEaseFactor: 1.05,
      surfaceType: 'asphalt',
    },
    visual: {
      roadColor: 0x111625,
      roadInnerColor: 0x1a2133,
      curbColor1: 0xff007f,
      curbColor2: 0x00f0ff,
      edgeGlowColor: 0xff007f,
      centerLineColor: 0x38bdf8,
      barrierColor: 0xff007f,
    },
  },
  {
    id: 'mountain-pass',
    name: 'Mountain Pass',
    environment: 'Alpine Switchbacks & Sheer Precipices',
    tagline: 'BRUTAL HAIRPIN TURNS & DRIFTING GORGES',
    description: 'Treacherous downhill switchbacks winding down rocky alpine ridges with zero guardrails and tight elevation changes.',
    recommendedDifficulty: 'HARD',
    length: '4.8 KM',
    laps: 3,
    surface: 'Cold Mountain Bitumen',
    accentColor: 0xf59e0b,
    secondaryColor: 0x94a3b8,
    terrainType: 'mountain',
    circuitPoints: [
      { x: 0.20, y: 0.20 },
      { x: 0.55, y: 0.22 },
      { x: 0.82, y: 0.32 },
      { x: 0.60, y: 0.42 },
      { x: 0.80, y: 0.58 },
      { x: 0.48, y: 0.64 },
      { x: 0.72, y: 0.78 },
      { x: 0.24, y: 0.78 },
      { x: 0.34, y: 0.50 },
    ],
    physics: {
      gripMultiplier: 0.95,
      accelMultiplier: 0.98,
      brakingMultiplier: 0.96,
      offRoadPenalty: 0.55,
      offRoadDrag: 0.970,
      driftEaseFactor: 1.15,
      surfaceType: 'asphalt',
    },
    visual: {
      roadColor: 0x1f242d,
      roadInnerColor: 0x2a303c,
      curbColor1: 0xf59e0b,
      curbColor2: 0x1e293b,
      edgeGlowColor: 0xf59e0b,
      centerLineColor: 0xf59e0b,
      barrierColor: 0xf59e0b,
    },
  },
  {
    id: 'desert-heat',
    name: 'Desert Heat',
    environment: 'Scorched Canyon Dunes & Salt Flats',
    tagline: 'ENDLESS DUNE DRIFTS & NITRO SALT FLATS',
    description: 'Blinding heat shimmering across wide canyon beds, high-speed dune banks, and open salt flat straightaways.',
    recommendedDifficulty: 'EASY',
    length: '4.0 KM',
    laps: 3,
    surface: 'Compacted Sand & Baked Tarmac',
    accentColor: 0xf97316,
    secondaryColor: 0xd97706,
    terrainType: 'desert',
    circuitPoints: [
      { x: 0.22, y: 0.30 },
      { x: 0.50, y: 0.18 },
      { x: 0.80, y: 0.30 },
      { x: 0.82, y: 0.68 },
      { x: 0.58, y: 0.78 },
      { x: 0.28, y: 0.72 },
    ],
    physics: {
      gripMultiplier: 0.94,
      accelMultiplier: 0.96,
      brakingMultiplier: 0.92,
      offRoadPenalty: 0.48,
      offRoadDrag: 0.965,
      driftEaseFactor: 1.18,
      surfaceType: 'sand',
    },
    visual: {
      roadColor: 0x3d2b1f,
      roadInnerColor: 0x4a3628,
      curbColor1: 0xf97316,
      curbColor2: 0xfef3c7,
      edgeGlowColor: 0xf97316,
      centerLineColor: 0xfde047,
      barrierColor: 0xf97316,
    },
  },
  {
    id: 'forest-trail',
    name: 'Forest Trail',
    environment: 'Dense Redwood Canopy & River Bends',
    tagline: 'MOSS-LINED APEXES & SHADOWED CANOPY CHICANES',
    description: 'Winding through giant ancient redwoods, wooden suspension bridges, and technical chicanes lined with mossy borders.',
    recommendedDifficulty: 'MEDIUM',
    length: '3.9 KM',
    laps: 3,
    surface: 'Sealed Woodland Course',
    accentColor: 0x10b981,
    secondaryColor: 0x064e3b,
    terrainType: 'forest',
    circuitPoints: [
      { x: 0.24, y: 0.24 },
      { x: 0.64, y: 0.20 },
      { x: 0.80, y: 0.42 },
      { x: 0.58, y: 0.52 },
      { x: 0.78, y: 0.72 },
      { x: 0.42, y: 0.78 },
      { x: 0.18, y: 0.60 },
      { x: 0.36, y: 0.42 },
    ],
    physics: {
      gripMultiplier: 0.96,
      accelMultiplier: 0.98,
      brakingMultiplier: 0.96,
      offRoadPenalty: 0.56,
      offRoadDrag: 0.968,
      driftEaseFactor: 1.10,
      surfaceType: 'dirt',
    },
    visual: {
      roadColor: 0x1a241e,
      roadInnerColor: 0x233129,
      curbColor1: 0x10b981,
      curbColor2: 0xffffff,
      edgeGlowColor: 0x10b981,
      centerLineColor: 0xa7f3d0,
      barrierColor: 0x10b981,
    },
  },
  {
    id: 'snow-peaks',
    name: 'Snow Peaks',
    environment: 'Glacial Ice Sheets & Blizzard Runways',
    tagline: 'SLICK FROZEN LAKES & ZERO-TRACTION CORNERS',
    description: 'Sub-zero temperatures across slick frozen lake crossings, icy crests, and blinding snow squalls that test drift control.',
    recommendedDifficulty: 'HARD',
    length: '4.4 KM',
    laps: 3,
    surface: 'Hardpacked Ice & Studded Bitumen',
    accentColor: 0x38bdf8,
    secondaryColor: 0x1e40af,
    terrainType: 'snow',
    circuitPoints: [
      { x: 0.22, y: 0.26 },
      { x: 0.46, y: 0.18 },
      { x: 0.76, y: 0.28 },
      { x: 0.84, y: 0.60 },
      { x: 0.62, y: 0.76 },
      { x: 0.36, y: 0.68 },
      { x: 0.16, y: 0.52 },
    ],
    physics: {
      gripMultiplier: 0.82,
      accelMultiplier: 0.88,
      brakingMultiplier: 0.74,
      offRoadPenalty: 0.52,
      offRoadDrag: 0.966,
      driftEaseFactor: 1.35,
      surfaceType: 'ice',
    },
    visual: {
      roadColor: 0x1e2e3d,
      roadInnerColor: 0x293d50,
      curbColor1: 0x38bdf8,
      curbColor2: 0xffffff,
      edgeGlowColor: 0x38bdf8,
      centerLineColor: 0xe0f2fe,
      barrierColor: 0x38bdf8,
    },
  },
  {
    id: 'volcano-run',
    name: 'Volcano Run',
    environment: 'Active Caldera & Molten Lava Fissures',
    tagline: 'MAGMA BRIDGES & HIGH-TEMPERATURE DRIFT GATES',
    description: 'Racing along the rim of an active volcanic caldera with cracking volcanic basalt roads and glowing subterranean magma falls.',
    recommendedDifficulty: 'HARD',
    length: '5.2 KM',
    laps: 3,
    surface: 'Basalt Glass & Steel Grating',
    accentColor: 0xef4444,
    secondaryColor: 0xff5500,
    terrainType: 'volcano',
    circuitPoints: [
      { x: 0.20, y: 0.24 },
      { x: 0.52, y: 0.22 },
      { x: 0.82, y: 0.36 },
      { x: 0.70, y: 0.56 },
      { x: 0.84, y: 0.74 },
      { x: 0.46, y: 0.80 },
      { x: 0.24, y: 0.62 },
      { x: 0.42, y: 0.44 },
    ],
    physics: {
      gripMultiplier: 0.98,
      accelMultiplier: 1.00,
      brakingMultiplier: 0.98,
      offRoadPenalty: 0.45,
      offRoadDrag: 0.962,
      driftEaseFactor: 1.12,
      surfaceType: 'basalt',
    },
    visual: {
      roadColor: 0x241414,
      roadInnerColor: 0x301c1c,
      curbColor1: 0xef4444,
      curbColor2: 0xffaa00,
      edgeGlowColor: 0xff3300,
      centerLineColor: 0xff5500,
      barrierColor: 0xef4444,
    },
  },
  {
    id: 'rural-village',
    name: 'Rural Village',
    environment: 'Rolling Pastoral Valleys & Cobblestone Towns',
    tagline: 'OLD WORLD CHICANES & SCENIC FARMLAND APEXES',
    description: 'Charming European countryside featuring cobblestone bridges, historic village plazas, and sweeping golden valley straights.',
    recommendedDifficulty: 'EASY',
    length: '3.4 KM',
    laps: 3,
    surface: 'Cobblestone & Smooth Rural Tarmac',
    accentColor: 0x84cc16,
    secondaryColor: 0xeab308,
    terrainType: 'rural',
    circuitPoints: [
      { x: 0.26, y: 0.22 },
      { x: 0.74, y: 0.24 },
      { x: 0.80, y: 0.50 },
      { x: 0.64, y: 0.72 },
      { x: 0.32, y: 0.76 },
      { x: 0.18, y: 0.50 },
    ],
    physics: {
      gripMultiplier: 0.96,
      accelMultiplier: 0.97,
      brakingMultiplier: 0.96,
      offRoadPenalty: 0.60,
      offRoadDrag: 0.974,
      driftEaseFactor: 1.08,
      surfaceType: 'cobblestone',
    },
    visual: {
      roadColor: 0x23262b,
      roadInnerColor: 0x2d3137,
      curbColor1: 0x84cc16,
      curbColor2: 0xffffff,
      edgeGlowColor: 0x84cc16,
      centerLineColor: 0xfef08a,
      barrierColor: 0x84cc16,
    },
  },
  {
    id: 'space-station',
    name: 'Space Station',
    environment: 'Zero-G Orbital Ring & Solar Array Tube',
    tagline: 'ORBITAL VACUUM JUMPS & MAGNETIC VELOCITY TUBES',
    description: 'High-tech orbital platform with magnetic propulsion tubes, zero-gravity vacuum straightaways, and Earth backdrop below.',
    recommendedDifficulty: 'HARD',
    length: '5.6 KM',
    laps: 3,
    surface: 'Mag-Lev Magnetic Composite',
    accentColor: 0xa855f7,
    secondaryColor: 0x00f0ff,
    terrainType: 'space',
    circuitPoints: [
      { x: 0.20, y: 0.28 },
      { x: 0.50, y: 0.16 },
      { x: 0.80, y: 0.28 },
      { x: 0.86, y: 0.54 },
      { x: 0.72, y: 0.78 },
      { x: 0.50, y: 0.70 },
      { x: 0.28, y: 0.80 },
      { x: 0.16, y: 0.54 },
    ],
    physics: {
      gripMultiplier: 1.08,
      accelMultiplier: 1.06,
      brakingMultiplier: 1.05,
      offRoadPenalty: 0.40,
      offRoadDrag: 0.960,
      driftEaseFactor: 0.95,
      surfaceType: 'metal',
    },
    visual: {
      roadColor: 0x121429,
      roadInnerColor: 0x1a1e3d,
      curbColor1: 0xa855f7,
      curbColor2: 0x00f0ff,
      edgeGlowColor: 0xa855f7,
      centerLineColor: 0x00f0ff,
      barrierColor: 0xa855f7,
    },
  },
];
