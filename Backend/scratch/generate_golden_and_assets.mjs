import fs from 'node:fs';
import path from 'node:path';

// Import game data and controllers
import { CARS } from '../../Frontend/src/data/CarData.ts';
import { TRACKS, WORLD_BORDER_MARGIN, WORLD_BORDER_RESTITUTION } from '../../Frontend/src/data/TrackData.ts';
import { TrackGeometry } from '../../Frontend/src/game/TrackGeometry.ts';
import { CarController } from '../../Frontend/src/game/CarController.ts';

// Ensure output directories exist under Backend/
const vehiclesOutDir = path.resolve('Backend/src/main/resources/vehicles');
const tracksOutDir = path.resolve('Backend/src/main/resources/tracks');
const goldenOutDir = path.resolve('Backend/src/test/resources/golden');

fs.mkdirSync(vehiclesOutDir, { recursive: true });
fs.mkdirSync(tracksOutDir, { recursive: true });
fs.mkdirSync(goldenOutDir, { recursive: true });

console.log('--- 1. Exporting Vehicle Configurations ---');
const carList = Array.isArray(CARS) ? CARS : Object.values(CARS);
const carMap = {};
for (const car of carList) {
  carMap[car.id] = car;
  const outPath = path.join(vehiclesOutDir, `${car.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(car, null, 2), 'utf-8');
  console.log(`Exported vehicle ${car.id} to ${outPath}`);
}

console.log('--- 2. Exporting Track Definitions ---');
const trackMap = {};
for (const trackInfo of TRACKS) {
  trackMap[trackInfo.id] = trackInfo;
  const geom = TrackGeometry.getTrackGeometry(trackInfo.id);

  const trackExport = {
    id: trackInfo.id,
    name: trackInfo.name,
    environment: trackInfo.environment,
    difficulty: trackInfo.difficulty || trackInfo.recommendedDifficulty,
    laps: trackInfo.laps,
    worldWidth: geom.worldWidth,
    worldHeight: geom.worldHeight,
    roadWidth: geom.roadWidth,
    physics: trackInfo.physics,
    waypoints: geom.waypoints.map(p => ({ x: p.x, y: p.y })),
    checkpoints: geom.checkpoints.map(cp => ({
      index: cp.index,
      x: cp.x,
      y: cp.y,
      angle: cp.angle,
      width: cp.width
    })),
    startGridPositions: geom.startGridPositions.map(slot => ({
      slot: slot.slot,
      x: slot.x,
      y: slot.y,
      angle: slot.angle
    })),
    spacedPoints: geom.spacedPoints.map(p => ({ x: p.x, y: p.y }))
  };

  const outPath = path.join(tracksOutDir, `${trackInfo.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(trackExport, null, 2), 'utf-8');
  console.log(`Exported track ${trackInfo.id} (${trackExport.checkpoints.length} checkpoints, ${trackExport.spacedPoints.length} points) to ${outPath}`);
}

console.log('--- 3. Generating Golden Conformance Vectors ---');

// Mock scene for CarController
class MockScene {
  constructor() {
    this.add = {
      sprite: (x, y, tex) => ({
        x, y, rotation: 0,
        setScale: () => {},
        setDepth: () => {},
        destroy: () => {}
      })
    };
  }
}
const mockScene = new MockScene();

// Helper to snapshot CarController state
function snapshotState(car) {
  return {
    x: car.x,
    y: car.y,
    vx: car.vx,
    vy: car.vy,
    rotation: car.rotation,
    forwardSpeed: car.forwardSpeed,
    lateralSpeed: car.lateralSpeed,
    currentSpeedKMH: car.currentSpeedKMH,
    nitroAmount: car.nitroAmount,
    isNitroActive: car.isNitroActive,
    isDrifting: car.isDrifting,
    driftAngleDeg: car.driftAngleDeg,
    driftDuration: car.driftDuration,
    isReverseGear: car.isReverseGear
  };
}

// 2-pass collision resolution from RaceScene.ts
function resolveVehicleCollisions(carA, carB) {
  const minDistance = 44;
  const vehicles = [
    {
      car: carA,
      x: carA.x,
      y: carA.y,
      vx: carA.vx,
      vy: carA.vy,
      massKg: carA.massKg || 1240,
      deflectRotation: (delta) => { carA.rotation += delta; }
    },
    {
      car: carB,
      x: carB.x,
      y: carB.y,
      vx: carB.vx,
      vy: carB.vy,
      massKg: carB.massKg || 1250,
      deflectRotation: (delta) => { carB.rotation += delta; }
    }
  ];

  // PASS 1: Overlap + Momentum + Tangential Friction + Scrub + Deflection
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const vA = vehicles[i];
      const vB = vehicles[j];

      const dx = vB.x - vA.x;
      const dy = vB.y - vA.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistance * minDistance && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDistance - dist;

        const nx = dx / dist;
        const ny = dy / dist;

        const mA = vA.massKg;
        const mB = vB.massKg;
        const totalMass = mA + mB;
        const wA = mB / totalMass;
        const wB = mA / totalMass;

        const sep = overlap * 1.02;
        vA.x -= nx * sep * wA;
        vA.y -= ny * sep * wA;
        vB.x += nx * sep * wB;
        vB.y += ny * sep * wB;

        const relVx = vB.vx - vA.vx;
        const relVy = vB.vy - vA.vy;
        const velAlongNormal = relVx * nx + relVy * ny;

        if (velAlongNormal < 0) {
          const restitution = Math.max(0.20, 0.35 - Math.abs(velAlongNormal) * 0.00012);
          let impulseScalar = -(1 + restitution) * velAlongNormal;
          const maxImpulse = Math.max(420, Math.abs(velAlongNormal) * 1.25);
          impulseScalar = Math.min(impulseScalar, maxImpulse);

          vA.vx -= nx * impulseScalar * wA;
          vA.vy -= ny * impulseScalar * wA;
          vB.vx += nx * impulseScalar * wB;
          vB.vy += ny * impulseScalar * wB;

          const tangentX = -ny;
          const tangentY = nx;
          const velAlongTangent = relVx * tangentX + relVy * tangentY;

          const frictionCoeff = 0.18;
          const maxFriction = impulseScalar * frictionCoeff;
          const frictionMagnitude = Math.min(Math.abs(velAlongTangent) * 0.35, maxFriction);
          const frictionScalar = -Math.sign(velAlongTangent) * frictionMagnitude;

          vA.vx -= tangentX * frictionScalar * wA;
          vA.vy -= tangentY * frictionScalar * wA;
          vB.vx += tangentX * frictionScalar * wB;
          vB.vy += tangentY * frictionScalar * wB;

          const scrubDamping = Math.min(0.035, (impulseScalar / 1000) * 0.02);
          if (scrubDamping > 0.001) {
            vA.vx -= vA.vx * scrubDamping * wA;
            vA.vy -= vA.vy * scrubDamping * wA;
            vB.vx -= vB.vx * scrubDamping * wB;
            vB.vy -= vB.vy * scrubDamping * wB;
          }

          const lateralA = (vA.vx * tangentX + vA.vy * tangentY) * 0.0006;
          vA.deflectRotation(lateralA * wA * 2.0);
          vB.deflectRotation(-lateralA * wB * 2.0);
        }
      }
    }
  }

  // PASS 2: Positional Relaxation Only
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const vA = vehicles[i];
      const vB = vehicles[j];

      const dx = vB.x - vA.x;
      const dy = vB.y - vA.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistance * minDistance && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDistance - dist;

        const nx = dx / dist;
        const ny = dy / dist;

        const mA = vA.massKg;
        const mB = vB.massKg;
        const totalMass = mA + mB;
        const wA = mB / totalMass;
        const wB = mA / totalMass;

        const sep = overlap * 1.02;
        vA.x -= nx * sep * wA;
        vA.y -= ny * sep * wA;
        vB.x += nx * sep * wB;
        vB.y += ny * sep * wB;
      }
    }
  }

  carA.x = vehicles[0].x;
  carA.y = vehicles[0].y;
  carA.vx = vehicles[0].vx;
  carA.vy = vehicles[0].vy;

  carB.x = vehicles[1].x;
  carB.y = vehicles[1].y;
  carB.vx = vehicles[1].vx;
  carB.vy = vehicles[1].vy;
}

const dt = 0.050; // 50ms = 20 TPS
const TOTAL_TICKS = 100;

const goldenData = {
  fixedTimestepSeconds: dt,
  totalTicks: TOTAL_TICKS,
  scenarios: {}
};

// Scenario 1: Straight acceleration
{
  console.log('Generating Scenario 1: Straight Acceleration...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['bolt-gt'], 'MEDIUM');
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const input = { throttle: 1.0, brake: 0.0, steer: 0.0, drift: false, nitro: false };
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_1_straight_acceleration'] = {
    carId: 'bolt-gt',
    trackId: 'coastal-rush',
    description: 'Straight line acceleration from standstill with throttle=1.0 for 100 ticks',
    ticks
  };
}

// Scenario 2: Braking
{
  console.log('Generating Scenario 2: Braking...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['bolt-gt'], 'MEDIUM');
  car.vx = 600;
  car.vy = 0;
  car.forwardSpeed = 600;
  car.lateralSpeed = 0;
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const input = { throttle: 0.0, brake: 1.0, steer: 0.0, drift: false, nitro: false };
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_2_braking'] = {
    carId: 'bolt-gt',
    trackId: 'coastal-rush',
    description: 'Full braking from initial speed of 600 px/s with brake=1.0 for 100 ticks',
    ticks
  };
}

// Scenario 3: Reverse gear transition
{
  console.log('Generating Scenario 3: Reverse Gear Transition...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['bolt-gt'], 'MEDIUM');
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    let input;
    if (t <= 60) {
      // Brake held: 0-25 engages reverse, 26-60 accelerates in reverse
      input = { throttle: 0.0, brake: 1.0, steer: 0.0, drift: false, nitro: false };
    } else {
      // Throttle applied while in reverse: acts as brake and transitions forward
      input = { throttle: 1.0, brake: 0.0, steer: 0.0, drift: false, nitro: false };
    }
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_3_reverse_transition'] = {
    carId: 'bolt-gt',
    trackId: 'coastal-rush',
    description: 'Reverse gear engagement via brake hold, reverse acceleration, then forward throttle recovery',
    ticks
  };
}

// Scenario 4: Steering & turning
{
  console.log('Generating Scenario 4: Steering & Turning...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['bolt-gt'], 'MEDIUM');
  car.vx = 300;
  car.vy = 0;
  car.forwardSpeed = 300;
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const input = { throttle: 1.0, brake: 0.0, steer: 0.75, drift: false, nitro: false };
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_4_steering_turning'] = {
    carId: 'bolt-gt',
    trackId: 'coastal-rush',
    description: 'Continuous turn with throttle=1.0 and steer=0.75 evaluating low-speed ease curve and yaw dynamics',
    ticks
  };
}

// Scenario 5: Drift & counter-steering
{
  console.log('Generating Scenario 5: Drift & Counter-Steering...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['viper-r'], 'MEDIUM');
  car.vx = 450;
  car.vy = 0;
  car.forwardSpeed = 450;
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    let input;
    if (t <= 40) {
      input = { throttle: 1.0, brake: 0.0, steer: 1.0, drift: true, nitro: false };
    } else {
      input = { throttle: 1.0, brake: 0.0, steer: -0.80, drift: true, nitro: false };
    }
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_5_drift_counter_steer'] = {
    carId: 'viper-r',
    trackId: 'coastal-rush',
    description: 'Deep drift followed by counter-steer evaluating yaw damping and lateral slip retention',
    ticks
  };
}

// Scenario 6: Nitro burn & regen
{
  console.log('Generating Scenario 6: Nitro Burn & Regen...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['bolt-gt'], 'MEDIUM');
  car.vx = 200;
  car.vy = 0;
  car.forwardSpeed = 200;
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    let input;
    if (t <= 40) {
      input = { throttle: 1.0, brake: 0.0, steer: 0.0, drift: false, nitro: true };
    } else {
      input = { throttle: 0.0, brake: 0.0, steer: 0.0, drift: false, nitro: false };
    }
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_6_nitro_burn_regen'] = {
    carId: 'bolt-gt',
    trackId: 'coastal-rush',
    description: 'Nitro boost acceleration for 40 ticks followed by coasting and passive nitro regeneration',
    ticks
  };
}

// Scenario 7: Mini-turbo activation & decay
{
  console.log('Generating Scenario 7: Mini-Turbo Activation...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['viper-r'], 'MEDIUM');
  car.vx = 420;
  car.vy = 0;
  car.forwardSpeed = 420;
  car.nitroAmount = 50; // set to 50 so +15 boost is clearly visible
  let miniTurboTriggered = false;
  let turboAwardTick = -1;

  let currentTick = 0;
  car.onMiniTurboAwarded = (boost) => {
    miniTurboTriggered = true;
    turboAwardTick = currentTick;
    console.log(`Mini-turbo awarded: +${boost}% at tick ${currentTick}`);
  };

  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    currentTick = t;
    let input;
    if (t <= 16) {
      // Drift turn: builds driftDuration (16 * 0.05 = 0.80s >= 0.55s) and qualifying slip
      input = { throttle: 1.0, brake: 0.0, steer: 1.0, drift: true, nitro: false };
    } else if (t <= 24) {
      // Straighten out without drift button to align heading with velocity (driftAngleDeg < 12)
      input = { throttle: 1.0, brake: 0.0, steer: -0.65, drift: false, nitro: false };
    } else {
      // Continue accelerating
      input = { throttle: 1.0, brake: 0.0, steer: 0.0, drift: false, nitro: false };
    }
    car.update(dt, input, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_7_mini_turbo'] = {
    carId: 'viper-r',
    trackId: 'coastal-rush',
    description: 'Drift slip qualification for >= 0.55s followed by recovery alignment (<12 deg) triggering +15% mini-turbo',
    miniTurboTriggered,
    turboAwardTick,
    ticks
  };
}

// Scenario 8: Off-road grip & drag
{
  console.log('Generating Scenario 8: Off-Road Grip & Drag...');
  const car = new CarController(mockScene, 950, 1920, 0, carMap['rally-apex'], 'MEDIUM');
  car.vx = 400;
  car.vy = 0;
  car.forwardSpeed = 400;
  const ticks = [];
  ticks.push({ tick: 0, input: null, state: snapshotState(car) });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const input = { throttle: 1.0, brake: 0.0, steer: 0.0, drift: false, nitro: false };
    // isOnTrack = false
    car.update(dt, input, false, false, 3200, 2400, trackMap['coastal-rush'].physics);
    ticks.push({ tick: t, input, state: snapshotState(car) });
  }

  goldenData.scenarios['scenario_8_off_road'] = {
    carId: 'rally-apex',
    trackId: 'coastal-rush',
    description: 'Off-road handling penalty, drag, and speed-bleed on Rally Apex with AWD bonus',
    ticks
  };
}

// Scenario 9: Multi-car collision & boundary response
{
  console.log('Generating Scenario 9: Multi-Car Collision & Boundary Response...');
  // Place car1 near left boundary moving left-downward, car2 close moving right-upward
  const car1 = new CarController(mockScene, 70, 70, Math.PI, carMap['bolt-gt'], 'MEDIUM');
  car1.vx = -120;
  car1.vy = -120;
  car1.forwardSpeed = 120;

  const car2 = new CarController(mockScene, 95, 90, 0, carMap['titan-v8'], 'MEDIUM');
  car2.vx = 150;
  car2.vy = 150;
  car2.forwardSpeed = 150;

  const ticks = [];
  ticks.push({
    tick: 0,
    input1: null,
    input2: null,
    car1: snapshotState(car1),
    car2: snapshotState(car2)
  });

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const input1 = { throttle: 1.0, brake: 0.0, steer: 0.1, drift: false, nitro: false };
    const input2 = { throttle: 1.0, brake: 0.0, steer: -0.1, drift: false, nitro: false };

    // 1. Single vehicle physics tick
    car1.update(dt, input1, false, true, 3200, 2400, trackMap['coastal-rush'].physics);
    car2.update(dt, input2, false, true, 3200, 2400, trackMap['coastal-rush'].physics);

    // 2. Multi-car collision resolution
    resolveVehicleCollisions(car1, car2);

    ticks.push({
      tick: t,
      input1,
      input2,
      car1: snapshotState(car1),
      car2: snapshotState(car2)
    });
  }

  goldenData.scenarios['scenario_9_multi_car_collision_and_boundary'] = {
    car1Id: 'bolt-gt',
    car2Id: 'titan-v8',
    trackId: 'coastal-rush',
    description: 'Two-car mutual collision impulse exchange, tangential friction, mass weighting, and world border margin reflection',
    ticks
  };
}

const goldenOutPath = path.join(goldenOutDir, 'physics-conformance-vectors.json');
fs.writeFileSync(goldenOutPath, JSON.stringify(goldenData, null, 2), 'utf-8');
console.log(`Successfully generated golden conformance vectors at ${goldenOutPath}`);
console.log(`File size: ${(fs.statSync(goldenOutPath).size / 1024).toFixed(1)} KB`);
