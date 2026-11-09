export interface CarStats {
  topSpeed: number;    // 0 to 100
  acceleration: number;// 0 to 100
  handling: number;    // 0 to 100
  nitro: number;       // 0 to 100
}

export interface NitroConfig {
  maxCapacity: number;       // Maximum energy (default 100)
  burnRate: number;          // Percent consumed per second (lower = longer burn duration)
  regenRate: number;         // Percent recharged per second
  speedMultiplier: number;   // Top speed multiplier under boost
  accelMultiplier: number;   // Acceleration multiplier under boost
}

export interface HandlingConfig {
  driftGripRetention: number;// Lateral friction multiplier during drift (0.92 to 0.96)
  driftTurnMultiplier: number;// Steering rate multiplier during drift (1.25 to 1.45)
  baseLateralGrip: number;   // Standard lateral grip factor on asphalt (0.84 to 0.88)
  lowSpeedAgility: number;   // Minimum low-speed steering agility (0.35 to 0.50)
  offRoadTractionBonus: number; // Traction & speed retention on off-road terrain (1.0 RWD, 1.25 AWD)
}

export interface CarConfig {
  id: string;
  name: string;
  class: string;
  tagline: string;
  description: string;
  stats: CarStats;
  nitroConfig: NitroConfig;
  handlingConfig: HandlingConfig;
  primaryColor: number;
  accentColor: number;
  glowColor: number;
  textureKey: string;
  drivetrain: string;
  weight: string;
  massKg: number;
  engine: string;
}

export const CARS: CarConfig[] = [
  {
    id: 'bolt-gt',
    name: 'BOLT GT',
    class: 'TUNER PRO // CLASS A',
    tagline: 'LIGHTNING ACCELERATION & AGILITY',
    description: 'A precision-tuned street weapon engineered for razor-sharp drift lines, instant turbo spool, and exceptional agility on technical circuits.',
    stats: {
      topSpeed: 84,
      acceleration: 88,
      handling: 92,
      nitro: 82,
    },
    nitroConfig: {
      maxCapacity: 100,
      burnRate: 26.0,          // 3.85s duration
      regenRate: 9.5,          // 10.5s full recharge (fast spooling)
      speedMultiplier: 1.35,   // ~352 km/h
      accelMultiplier: 2.10,
    },
    handlingConfig: {
      driftGripRetention: 0.94,// Agile, highly predictable powersliding
      driftTurnMultiplier: 1.38,// Quick drift initiation
      baseLateralGrip: 0.85,   // Razor-sharp turn-in
      lowSpeedAgility: 0.46,   // Very nimble in tight chicanes
      offRoadTractionBonus: 1.00,
    },
    primaryColor: 0xff5500, // Fiery Orange
    accentColor: 0x00f0ff,  // Cyan
    glowColor: 0xff7700,
    textureKey: 'car_bolt_gt',
    drivetrain: 'RWD • TURBO INLINE-6',
    weight: '1,240 KG',
    massKg: 1240,
    engine: '3.0L TWIN-TURBO (540 HP)',
  },
  {
    id: 'viper-r',
    name: 'VIPER R',
    class: 'EXOTIC HYPERCAR // CLASS S',
    tagline: 'UNCOMPROMISING TERMINAL VELOCITY',
    description: 'An ultra-lightweight aerodynamic carbon silhouette engineered for maximum downforce, blistering top speeds, and sweeping high-speed corners.',
    stats: {
      topSpeed: 96,
      acceleration: 86,
      handling: 82,
      nitro: 85,
    },
    nitroConfig: {
      maxCapacity: 100,
      burnRate: 25.0,          // 4.00s duration
      regenRate: 8.0,          // 12.5s recharge
      speedMultiplier: 1.38,   // ~382 km/h (highest terminal velocity in the game)
      accelMultiplier: 2.00,
    },
    handlingConfig: {
      driftGripRetention: 0.95,// Aerodynamic downforce; wide, sweeping drifts
      driftTurnMultiplier: 1.30,
      baseLateralGrip: 0.87,   // Firm high-speed asphalt track grip
      lowSpeedAgility: 0.38,
      offRoadTractionBonus: 0.95,// Lower ground clearance penalizes deep grass/sand
    },
    primaryColor: 0x10b981, // Emerald Green
    accentColor: 0xeab308,  // Gold / Yellow
    glowColor: 0x059669,
    textureKey: 'car_viper_r',
    drivetrain: 'MR • MID-ENGINE V10',
    weight: '1,180 KG',
    massKg: 1180,
    engine: '5.2L QUAD-CAM V10 (680 HP)',
  },
  {
    id: 'rally-apex',
    name: 'RALLY APEX',
    class: 'ALL-TERRAIN AWD // CLASS B',
    tagline: 'ALL-SURFACE EXPLOSIVE TRACTION',
    description: 'Dual-differential rally rocket built for immediate zero-to-sixty launching, unstoppable dirt and wet grip, and rugged chassis durability.',
    stats: {
      topSpeed: 78,
      acceleration: 96,
      handling: 88,
      nitro: 88,
    },
    nitroConfig: {
      maxCapacity: 100,
      burnRate: 27.0,          // 3.70s duration
      regenRate: 9.0,          // 11.1s recharge
      speedMultiplier: 1.32,   // ~333 km/h
      accelMultiplier: 2.25,   // Explosive launch kick
    },
    handlingConfig: {
      driftGripRetention: 0.93,// AWD holds cornering line tightly even during lateral slide
      driftTurnMultiplier: 1.35,
      baseLateralGrip: 0.84,   // Immediate directional change
      lowSpeedAgility: 0.50,   // Highest low-speed snap
      offRoadTractionBonus: 1.25,// Unmatched AWD grip on dirt, sand & grass
    },
    primaryColor: 0x00f0ff, // Electric Cyan
    accentColor: 0xffffff,  // Pure White
    glowColor: 0x0284c7,
    textureKey: 'car_rally_apex',
    drivetrain: 'AWD • VARIABLE TORQUE',
    weight: '1,290 KG',
    massKg: 1290,
    engine: '2.0L TURBOCHARGED 4-CYL (420 HP)',
  },
  {
    id: 'titan-v8',
    name: 'TITAN V8',
    class: 'MUSCLE BRUTE // CLASS A',
    tagline: 'COLOSSAL TORQUE & PROLONGED NITRO',
    description: 'Raw, unadulterated American horsepower boasting a supercharged big-block V8 that delivers massive straight-line momentum and devastating nitro surge.',
    stats: {
      topSpeed: 90,
      acceleration: 82,
      handling: 72,
      nitro: 98,
    },
    nitroConfig: {
      maxCapacity: 100,
      burnRate: 19.5,          // PROLONGED NITRO: 5.13s duration (>40% longer than any car!)
      regenRate: 7.5,          // 13.3s recharge (large supercharger reserve)
      speedMultiplier: 1.36,   // ~367 km/h
      accelMultiplier: 2.30,   // Massive torque surge
    },
    handlingConfig: {
      driftGripRetention: 0.96,// Heavy mass carries wide momentum powerslides
      driftTurnMultiplier: 1.25,// Muscle car steering weight
      baseLateralGrip: 0.86,
      lowSpeedAgility: 0.35,   // Deliberate, heavy front-end feel
      offRoadTractionBonus: 1.00,
    },
    primaryColor: 0xef4444, // Crimson Red
    accentColor: 0xf59e0b,  // Amber Flame
    glowColor: 0xb91c1c,
    textureKey: 'car_titan_v8',
    drivetrain: 'RWD • SUPERCHARGED V8',
    weight: '1,560 KG',
    massKg: 1560,
    engine: '6.2L SUPERCHARGED HEMI (750 HP)',
  },
];

