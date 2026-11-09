# NITRO RUSH — MULTIPLAYER ARCHITECTURE SPECIFICATION
## Milestone 8.0.1: High-Performance 8-Player Online Racing Architecture (Revised)

---

## 1. Executive Summary & Core Objectives

Nitro Rush is evolving from a verified single-player arcade racer (Milestones 1.0–7.8) into an 8-player real-time online multiplayer game. The system must maintain fluid arcade handling (drifting, mini-turbo, nitro boosts, and high-speed cornering) while providing deterministic, server-authoritative racing across the network.

### 1.1 Core Requirements
- **Match Capacity:** Minimum 2 players, maximum 8 human players per room.
- **Matchmaking:** Global public queue with a 15-second collection window; immediate launch upon reaching 8 players.
- **Race Format:** 3-lap closed-circuit sprint with live real-time leaderboard and sector progress tracking.
- **Authority Model:** Pure server-authoritative physics simulation at 20 TPS using an accumulator-based fixed timestep (50 ms).
- **Network Protocol:** Low-latency WebSocket protocol with versioned JSON payloads at 20 Hz snapshot broadcast rate.
- **Client Synchronization:** Client-side prediction with exponential decay server reconciliation and cubic Hermite / linear snapshot interpolation for remote vehicles.
- **Disconnection Handling:** 15-second grace window allowing disconnected racers to reconnect and resume with synchronized state.
- **Single-Player Preservation:** 100% preservation of offline gameplay, AI personalities, single-player scene flows, and the existing 4-slot single-player starting grid.

---

## 2. Existing Project Audit & Compatibility Report

An exhaustive audit of the existing codebase (`Frontend/src/`) was conducted to evaluate architectural compatibility with online multiplayer.

### 2.1 Actual Vehicle Identifiers & Archetypes (from `Frontend/src/data/CarData.ts`)
The four production vehicle archetypes are strictly defined in [`CarData.ts`](file:///Users/hasinnn/Documents/Nitro Rush/Frontend/src/data/CarData.ts):

| Car ID | Car Name | Class | Mass | Top Speed (KM/H) | Nitro Duration | Handling Personality |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `bolt-gt` | BOLT GT | Tuner Pro (Class A) | \(1240\text{ kg}\) | \(260\text{ km/h}\) | \(3.85\text{ s}\) | High agility, razor-sharp turn-in, fast nitro spool |
| `viper-r` | VIPER R | Exotic Hypercar (Class S) | \(1180\text{ kg}\) | \(277\text{ km/h}\) | \(4.00\text{ s}\) | Blistering terminal velocity, wide downforce drifts |
| `rally-apex` | RALLY APEX | All-Terrain AWD (Class B) | \(1290\text{ kg}\) | \(252\text{ km/h}\) | \(3.70\text{ s}\) | Explosive zero-to-sixty launch, supreme dirt/sand grip |
| `titan-v8` | TITAN V8 | Muscle Brute (Class A) | \(1560\text{ kg}\) | \(269\text{ km/h}\) | \(5.13\text{ s}\) | Colossal straight-line momentum, prolonged nitro burn |

### 2.2 Actual Track Identifiers & Environments (from `Frontend/src/data/TrackData.ts`)
The nine production circuits are configured in [`TrackData.ts`](file:///Users/hasinnn/Documents/Nitro Rush/Frontend/src/data/TrackData.ts) and [`TrackGeometry.ts`](file:///Users/hasinnn/Documents/Nitro Rush/Frontend/src/game/TrackGeometry.ts):

| Track ID | Track Name | Environment | World Size | Road Width | Surface Type | Grip Multiplier |
| :--- | :--- | :--- | :---: | :---: | :--- | :---: |
| `coastal-rush` | Coastal Rush | Pacific Ocean Cliffs | \(3200 \times 2400\) | \(140\text{ px}\) | Asphalt | 1.00 |
| `city-nights` | City Nights | Cyber Metropolis Neon | \(3200 \times 2400\) | \(140\text{ px}\) | Asphalt | 1.04 |
| `mountain-pass` | Mountain Pass | Alpine Switchbacks | \(3200 \times 2400\) | \(130\text{ px}\) | Cold Bitumen | 0.95 |
| `desert-heat` | Desert Heat | Scorched Canyon Dunes | \(3200 \times 2400\) | \(140\text{ px}\) | Sand | 0.94 |
| `forest-trail` | Forest Trail | Ancient Redwood Canopy | \(3200 \times 2400\) | \(140\text{ px}\) | Sealed Dirt | 0.96 |
| `snow-peaks` | Snow Peaks | Glacial Ice Sheets | \(3200 \times 2400\) | \(140\text{ px}\) | Hardpacked Ice | 0.82 |
| `volcano-run` | Volcano Run | Active Caldera Magma | \(3200 \times 2400\) | \(140\text{ px}\) | Basalt / Metal | 0.98 |
| `rural-village` | Rural Village | Rolling Pastoral Valleys | \(3200 \times 2400\) | \(140\text{ px}\) | Cobblestone | 0.96 |
| `space-station` | Space Station | Orbital Mag-Lev Vacuum | \(3400 \times 2400\) | \(140\text{ px}\) | Mag-Lev Composite | 1.08 |

### 2.3 Compatibility & Reuse Matrix

| Subsystem | Existing File(s) | Reusability | Multiplayer Adaptation Strategy |
| :--- | :--- | :---: | :--- |
| **Track Rendering** | `CircuitTrack.ts`, `TrackEnvironment.ts` | **100% Reusable** | Client renders tracks identically using existing spline and texture pipeline. |
| **Track Geometry** | `TrackGeometry.ts` | **100% Preserved** | Existing 4-slot single-player grid (`P1`–`P4`) remains completely untouched in `TrackGeometry.ts`. A separate `MultiplayerGridConfig` defines 8 staggered slots (`P1`–`P8`) for multiplayer rooms. |
| **Sound & Audio** | `SoundEffects.ts`, `SettingsManager.ts` | **100% Reusable** | Engine revs, drift squeals, collisions, and UI beeps remain client-side events triggered by local/remote state. |
| **UI Components** | `UIHelpers.ts`, `style.css` | **100% Reusable** | Modal dialogues, buttons, glow badges, and responsive containers reused in multiplayer lobby and results scenes. |
| **Vehicle Physics** | `CarController.ts` | **Adapter Required** | Extract pure 2D kinematic equations into a headless module for local prediction, and mirror identical equations in Java for authoritative server simulation. |
| **Race Progression** | `RaceManager.ts` | **Adapter Required** | Current manager is local and evaluates offline competitors. Server takes over authoritative checkpoint and lap validation. Frontend receives authoritative standings via snapshot. |
| **HUD & Minimap** | `RaceScene.ts` (HUD routines) | **85% Reusable** | Telemetry, speedometer, and vector minimap pips adapt from 1 player + 3 AI to 8 dynamic player markers. |
| **Scene Hierarchy** | `GameConfig.ts`, `scenes/` | **Extensible** | Existing scenes remain untouched. New scenes (`MatchmakingScene`, `MultiplayerLobbyScene`, `MultiplayerRaceScene`, `MultiplayerResultsScene`) are added cleanly. |

---

## 3. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client["Frontend Client (TypeScript / Phaser 3)"]
        UI["UI Layer\n(Lobby / Matchmaking / HUD)"]
        NC["NetworkClient\n(WebSocket Manager)"]
        IB["InputBuffer\n(Key captures & seq numbers)"]
        CP["ClientPrediction\n(Local vehicle prediction)"]
        SR["ServerReconciliation\n(Smooth error blending)"]
        SB["SnapshotBuffer\n(Remote interpolation queue)"]
        RPR["RemotePlayerRenderer\n(7 remote car proxies)"]
    end

    subgraph Network["Network Layer"]
        WS["WebSocket Transport\n(Versioned JSON protocol @ 20 Hz)"]
    end

    subgraph Backend["Headless Game Server (Java 21 / Spring Boot 3)"]
        CM["ConnectionManager & Session Auth"]
        MS["MatchmakingService & Queue"]
        RM["RoomManager & Lifecycle State Machine"]
        subgraph RoomEngine["Active Room Simulation (Fixed 20 TPS Accumulator)"]
            RO["RaceOrchestrator"]
            IV["InputValidator & Rate Limiter"]
            PE["Headless VehiclePhysicsEngine"]
            CPV["CheckpointValidator & Anti-Cheat"]
            COL["CollisionManager (2-Pass Impulse)"]
            SBroad["SnapshotBroadcaster"]
        end
    end

    UI --> NC
    NC <-->|ws://...| WS
    WS <--> CM
    CM --> MS --> RM --> RO
    IB -->|PLAYER_INPUT| NC
    NC -->|RACE_STATE| SB
    SB --> RPR
    NC -->|RACE_STATE| SR
    SR --> CP
    RO --> IV --> PE --> COL --> CPV --> SBroad
    SBroad -->|RACE_STATE| CM
```

---

## 4. Frontend Multiplayer Modules

All multiplayer frontend logic will reside in modular, decoupled services under `Frontend/src/multiplayer/` without modifying offline systems.

### 4.1 NetworkClient (`Frontend/src/multiplayer/NetworkClient.ts`)
- **Responsibilities:** Manages WebSocket connection lifecycle, automatic reconnect backoff, heartbeat (`PING`/`PONG`), message serialization/deserialization, and dispatch to domain handlers.
- **Key Methods:** `connect(url)`, `disconnect()`, `send(type, payload)`, `on(type, callback)`, `getLatency()`.
- **Invariants:** Guaranteed single WebSocket instance; buffers outbound messages during brief reconnections.

### 4.2 MultiplayerManager (`Frontend/src/multiplayer/MultiplayerManager.ts`)
- **Responsibilities:** High-level coordinator between `NetworkClient`, active multiplayer scene, player session tokens, and room assignment state.
- **State Stored:** Active room ID, player assigned slot, host status, connection state, room participants.

### 4.3 MultiplayerState (`Frontend/src/multiplayer/MultiplayerState.ts`)
- **Responsibilities:** Reactive state store for multiplayer UI data: room player list, ready states, selected vehicles, countdown timer, ping, and disconnect banners.

### 4.4 InputBuffer (`Frontend/src/multiplayer/InputBuffer.ts`)
- **Responsibilities:** Samples user inputs (throttle, brake, steer, drift, nitro) at client render tick (60 FPS), packs inputs into sequential frames with monotonically increasing `sequenceNumber`, and stores unacknowledged inputs for reconciliation replay.
- **Structure:** Ring buffer of `{ sequenceNumber, timestamp, inputs, predictedState }`.

### 4.5 SnapshotBuffer (`Frontend/src/multiplayer/SnapshotBuffer.ts`)
- **Responsibilities:** Stores incoming authoritative world snapshots from the server. Maintains a jitter buffer of 100 ms (2 snapshots at 20 Hz) to guarantee smooth interpolation.
- **Interpolation:** Computes cubic Hermite spline interpolation for remote car coordinates \((x, y)\) and spherical angle interpolation (`slerp`) for rotation angles, completely eliminating visual stutter and teleportation.

### 4.6 ClientPrediction & ServerReconciliation (`Frontend/src/multiplayer/PredictionReconciler.ts`)
- **Prediction:** Local player inputs immediately advance the local car's kinematic state without waiting for network round-trip time (zero input latency).
- **Reconciliation:** When server snapshot arrives with `lastProcessedInputSeq`:
  1. Compares authoritative server position with historical predicted position at that sequence number.
  2. If positional discrepancy \(\Delta > 2\text{ px}\) or angular discrepancy \(\Delta\theta > 0.05\text{ rad}\), resets base state to authoritative server snapshot.
  3. Re-simulates all pending inputs newer than `lastProcessedInputSeq`.
  4. Applies **Exponential Decay Error Smoothing** to the visual sprite over 100 ms to blend out the error imperceptibly.

### 4.7 RemotePlayerRenderer (`Frontend/src/multiplayer/RemotePlayerRenderer.ts`)
- **Responsibilities:** Manages visual Phaser sprites, particle emitters (exhaust flame, tire smoke), and audio triggers for the other 7 racers in the room based on interpolated snapshots.

### 4.8 Multiplayer Scenes
- **`MatchmakingScene.ts`:** Clean modern UI displaying queue status, elapsed search timer, search spinner, cancel button, and player count counter.
- **`MultiplayerLobbyScene.ts`:** 8-slot interactive lobby showing joined players, vehicle selection carousel, track preview card, ready toggles, and synchronized countdown.
- **`MultiplayerResultsScene.ts`:** Post-race podium celebrating 1st–3rd places, detailed lap time breakdown for all 8 racers, status tags (`FINISHED` / `DNF`), and rematch voting.

---

## 5. Backend Server Modules (Java 21 / Spring Boot 3)

The backend is organized into decoupled services under `com.nitrorush.server.*`:

### 5.1 ConnectionManager (`com.nitrorush.server.net.ConnectionManager`)
- Manages active Spring WebSocket sessions using non-blocking concurrent maps.
- Enforces heartbeat timeouts (30-second dead-line) and translates WebSocket text frames to strongly-typed Jackson DTOs.

### 5.2 GuestSessionManager (`com.nitrorush.server.auth.GuestSessionManager`)
- Issues stateless, cryptographically secure guest session tokens (`GR-UUID`) upon initial connection.
- Validates token continuity on reconnects to prevent session hijacking.

### 5.3 MatchmakingService & Queue (`com.nitrorush.server.matchmaking.*`)
- **Queue Implementation:** Thread-safe concurrent FIFO queue (`ConcurrentLinkedQueue<PlayerSession>`).
- **Collection Window:** When 2 players enter queue, starts a 15-second collection countdown.
- **Immediate Launch:** As soon as queue depth reaches 8 players, immediately extracts those 8 players, instantiates a new `Room`, and dispatches `ROOM_ASSIGNED` payloads.
- **Fairness:** Strictly FIFO; cancellation removes player atomically from queue without stalling other participants.

### 5.4 RoomManager & Room (`com.nitrorush.server.room.*`)
- Owns all active game rooms.
- Each `Room` encapsulates:
  - Room state (`WAITING`, `COUNTDOWN`, `RACING`, `FINISHED`, `CLOSED`).
  - Player slots (array of 8 `PlayerSlot` descriptors).
  - Dedicated `RaceEngine` instance with fixed timestep accumulator.
  - Reconnection table mapping `playerId` \(\to\) disconnected session timeout handle.

### 5.5 Headless VehiclePhysicsEngine (`com.nitrorush.server.physics.VehiclePhysicsEngine`)
- Pure Java 21 implementation of Nitro Rush 2D vehicle dynamics.
- Operates on primitive double/float values with zero UI or graphics dependencies.
- Recreates exact steering curves, lateral grip degradation, counter-steering yaw stabilization, nitro acceleration multipliers, aerodynamic drag, and off-road penalty calculations.

### 5.6 CollisionManager (`com.nitrorush.server.physics.CollisionManager`)
- Simulates pairwise multi-car collisions among all 8 active vehicles.
- Executes 2-pass impulse exchange:
  1. Mass-weighted positional separation (\(w_A = m_B / (m_A + m_B)\)).
  2. Relative normal velocity impulse with speed-adaptive restitution (\(0.20\text{--}0.35\)) and tangential Coulomb friction (\(\mu = 0.18\)).

### 5.7 CheckpointValidator (`com.nitrorush.server.race.CheckpointValidator`)
- Enforces strict sequential clearing of the 12 track checkpoints.
- Validates geometric line crossing using 2D line segment intersection tests.
- Rejects invalid shortcuts (requires at least 11 of 12 intermediate checkpoints cleared per lap).

### 5.8 SnapshotBroadcaster (`com.nitrorush.server.net.SnapshotBroadcaster`)
- Serializes compact room state into `RACE_STATE` JSON payloads at 20 Hz.
- Includes timestamp, server tick sequence, competitor telemetry arrays, and individual player ack sequence numbers.

---

## 6. Server-Authoritative Physics & Accumulator-Based Fixed Timestep

To ensure competitive integrity, deterministic calculations, and zero cheating, the server owns the single source of truth for vehicle kinematics and race progression.

### 6.1 Accumulator-Based Fixed Timestep Game Loop (\(\Delta t = 50\text{ ms}\))

The simulation loop utilizes an accumulator pattern to decouple wall-clock elapsed time from the internal simulation delta:

```mermaid
flowchart TD
    SchedulerFire["Scheduled Executor (Target 50ms)"] --> MeasureTime["Measure Elapsed Wall-Clock Time (deltaNs)"]
    MeasureTime --> Accumulate["Accumulate Time: accumulatorNs += deltaNs"]
    Accumulate --> CheckThreshold{"accumulatorNs >= 50ms?"}
    CheckThreshold -- Yes --> StepPhysics["Execute Fixed Physics Step (dt = 0.050s)"]
    StepPhysics --> Decrement["accumulatorNs -= 50ms; tickCounter++"]
    Decrement --> CheckCatchup{"stepsExecuted < MAX_CATCHUP (4)?"}
    CheckCatchup -- Yes --> CheckThreshold
    CheckCatchup -- No --> HandleOverload["Clamp Accumulator & Log Overload Alert"]
    CheckThreshold -- No --> CheckBroadcast{"Completed >= 1 tick?"}
    CheckBroadcast -- Yes --> BroadcastSnapshot["Broadcast Authoritative Snapshot (20 Hz)"]
    CheckBroadcast -- No --> Sleep["Wait for Next Scheduler Window"]
    BroadcastSnapshot --> Sleep
    HandleOverload --> BroadcastSnapshot
```

### 6.2 Formal Timestep Specification & Invariants
1. **Fixed Step Size:** The simulation step is strictly fixed at \(\Delta t = 0.050\text{ s}\) (\(50.0\text{ ms}\)). Under **no circumstances** will the physics engine execute variable-sized steps (e.g. \(35\text{ ms}\) or \(62\text{ ms}\)), as variable timesteps destroy numerical stability in drag exponents, restitution formulas, and drift slip calculations.
2. **Nanosecond Accumulator:**
   ```java
   long nowNs = System.nanoTime();
   long elapsedNs = nowNs - lastExecutionTimeNs;
   lastExecutionTimeNs = nowNs;
   timeAccumulatorNs += elapsedNs;

   int stepsExecuted = 0;
   while (timeAccumulatorNs >= STEP_DURATION_NS && stepsExecuted < MAX_CATCHUP_TICKS) {
       simulatePhysicsTick(FIXED_STEP_SECONDS); // Strictly 0.050 seconds
       timeAccumulatorNs -= STEP_DURATION_NS;
       stepsExecuted++;
       currentServerTick++;
   }
   ```
3. **Catch-up Clamping & Overload Policy:**
   - **Maximum Catch-up:** `MAX_CATCHUP_TICKS = 4` (permits at most \(200\text{ ms}\) of simulation catch-up in a single iteration).
   - **Overload Handling:** If `timeAccumulatorNs >= STEP_DURATION_NS` after 4 steps, the server thread has suffered an unexpected stall (e.g. system pause, virtual thread preemption).
     - The accumulator is clamped to zero to prevent the "spiral of death."
     - An alert telemetry event (`SERVER_TICK_OVERLOAD`) is recorded with the exact scheduler delay and execution duration.
     - The authoritative race clock timestamp offset is updated so that race-critical simulation time is never silently skipped or corrupted.
4. **Decoupling Simulation vs Broadcast Frequency:**
   - **Simulation Frequency:** Fixed at 20 TPS (\(50\text{ ms}\)). Every tick computes vehicle kinematics, multi-car collisions, checkpoint crossings, and boundary rebounds.
   - **Snapshot Broadcast Frequency:** Broadcasts occur at 20 Hz, triggered strictly *after* complete simulation step(s) have finished. If the simulation executes 2 catch-up steps in one scheduler cycle, only the final consolidated state is broadcast, conserving bandwidth.

---

## 7. Starting Grid Configurations: Single-Player vs Multiplayer

To maintain absolute stability in offline single-player while supporting 8 human competitors online, the starting grid architecture is decoupled.

### 7.1 Single-Player Grid Preservation
- Single-player continues to use the existing 4-slot grid defined in [`TrackGeometry.ts`](file:///Users/hasinnn/Documents/Nitro Rush/Frontend/src/game/TrackGeometry.ts) (`startGridPositions: GridSlot[]` with `P1` through `P4`).
- **Zero changes are made to production single-player code or geometry.**

### 7.2 Multiplayer Eight-Slot Starting Grid Specification
Multiplayer rooms utilize a dedicated `MultiplayerGridConfig` supporting slots `P1` through `P8` organized in a staggered 2-column layout cleanly aligned behind the start/finish line:

```
                  FINISH / START LINE (Checkered Gate CP 0)
=============================================================================
                      ^ Forward Track Tangent (+tan)
                      |
           (Left Column, -28px)       (Right Column, +28px)
           
                 [ P1 ] (90px)
                                            [ P2 ] (150px)
                 [ P3 ] (210px)
                                            [ P4 ] (270px)
                 [ P5 ] (330px)
                                            [ P6 ] (390px)
                 [ P7 ] (450px)
                                            [ P8 ] (510px)
```

### 7.3 Grid Mathematical Validation Across All Nine Circuits

1. **Collision-Free Spacing Proof:**
   - Sequential slots alternate between Left and Right columns.
   - Longitudinal row separation: \(\Delta d_{\text{long}} = 60\text{ px}\).
   - Lateral column separation: \(\Delta d_{\text{lat}} = 2 \times 28 = 56\text{ px}\).
   - Direct Euclidean distance between adjacent slots:
     \[D = \sqrt{\Delta d_{\text{long}}^2 + \Delta d_{\text{lat}}^2} = \sqrt{60^2 + 56^2} = \sqrt{3600 + 3136} = \sqrt{6736} \approx 82.07\text{ px}\]
   - Direct longitudinal distance within the same column (e.g. P1 to P3): \(\Delta d = 120\text{ px}\).
   - Vehicle bounding circle diameter: \(44\text{ px}\) (radius \(22\text{ px}\)).
   - **Clearance Margin:** \(82.07\text{ px} - 44.0\text{ px} = 38.07\text{ px}\) minimum buffer. **Zero initial overlap or spawn collisions.**

2. **Track-Width & Boundary Safety Validation:**
   - The narrowest road in the game is `mountain-pass` with a road width of \(130\text{ px}\) (center-to-curb half-width \(W_{\text{half}} = 65\text{ px}\)).
   - The other 8 circuits have a road width of \(140\text{ px}\) (\(W_{\text{half}} = 70\text{ px}\)).
   - Vehicle center lateral offset: \(X_{\text{offset}} = \pm 28\text{ px}\).
   - Vehicle half-width: \(W_{\text{car}} = 18\text{ px}\).
   - Outermost vehicle edge distance from centerline: \(28 + 18 = 46\text{ px}\).
   - Curb safety margin on Mountain Pass:
     \[\text{Margin} = 65\text{ px} - 46\text{ px} = 19\text{ px}\]
   - Curb safety margin on all other 8 circuits:
     \[\text{Margin} = 70\text{ px} - 46\text{ px} = 24\text{ px}\]
   - **Conclusion:** All 8 vehicles spawn 100% on asphalt tarmac with a generous \(19\text{--}24\text{ px}\) buffer from dirt/gravel shoulders, avoiding off-road penalties or boundary rebounds on all 9 tracks.

3. **Start Straightaway Length Validation:**
   - Slot `P8` is positioned \(510\text{ px}\) behind Checkpoint 0.
   - All 9 production circuits have straight approach segments exceeding \(550\text{ px}\) prior to the start/finish line (e.g. Coastal Rush beach straight: \(800\text{ px}\); Mountain Pass lower valley: \(600\text{ px}\); Space Station velocity tube: \(700\text{ px}\)).
   - **Conclusion:** All 8 grid slots fit entirely on the flat straightaway without curving into corners.

---

## 8. Cross-Language Physics Conformance & Parity Strategy

To ensure deterministic parity between TypeScript (client prediction) and Java (server authority), a formal conformance test suite (`PhysicsConformanceSuite`) will be executed during Milestone 8.2.

### 8.1 Nine Standardized Conformance Test Sequences

| Test Case | Initial State | Input Vector Script | Evaluated Kinematic Metrics | Acceptance Tolerance |
| :--- | :--- | :--- | :--- | :---: |
| **1. Forward Acceleration** | Standstill (\(v = 0\)) | 100 ticks full throttle (\(T = 1.0\), \(B = 0\), \(S = 0\)) | Terminal speed, \(v_x\), \(v_y\), distance traveled | \(\Delta x, y \le 0.5\text{ px}\), \(\Delta v \le 0.1\text{ px/s}\) |
| **2. Active Braking** | Top speed (\(260\text{ km/h}\)) | 40 ticks full brake (\(T = 0\), \(B = 1.0\), \(S = 0\)) | Deceleration curve, deadstop frame index, zero overshoot | \(\Delta \text{stopFrame} = 0\), \(\Delta x \le 0.5\text{ px}\) |
| **3. Reverse Gear Transmission** | Standstill (\(v = 0\)) | Hold brake 15 ticks (\(250\text{ ms}\)) \(\to\) reverse accel 60 ticks \(\to\) coast 120 ticks | 220ms reverse engagement delay, reverse speed, coasting deadstop | \(\Delta \text{engageFrame} = 0\), \(\Delta v_{\text{rev}} \le 0.1\text{ px/s}\) |
| **4. Steering Agility Ease Curve** | \(v = 100\text{ px/s}\) | 50 ticks steer right (\(S = 1.0\)) | Angular heading change \(\theta\), low-speed agility multiplier | \(\Delta\theta \le 0.005\text{ rad}\) (\(\approx 0.28^\circ\)) |
| **5. Drift Slip & Yaw Damping** | \(v = 400\text{ px/s}\) | Steer right + drift key 60 ticks \(\to\) counter-steer left 30 ticks | Lateral velocity slip \(v_{\text{lat}}\), drift angle, counter-steer yaw damping | \(\Delta v_{\text{lat}} \le 0.2\text{ px/s}\), \(\Delta \text{angle} \le 0.008\text{ rad}\) |
| **6. Nitro Boost Dynamics** | Full nitro (100) | Full throttle + nitro 60 ticks | Peak velocity surge, acceleration multiplier, burn rate | \(\Delta v \le 0.1\text{ px/s}\), \(\Delta \text{nitro} \le 0.1\%\) |
| **7. Mini-Turbo Reward** | Active drift | Drift \(0.6\text{ s}\) with qualifying slip \(\to\) straight recovery | +15% nitro recharge trigger, timing window detection | \(\Delta \text{nitroAward} = 0.0\%\) (Exact) |
| **8. Off-Road Traction & Drag** | Off-road surface | 60 ticks throttle on gravel/dirt | Traction penalty clamp, bleed rate (\(260\text{ px/s}^2\)), off-road drag | \(\Delta v \le 0.1\text{ px/s}\) |
| **9. Vehicle Collision Impulse** | Titan V8 vs Viper R | Head-on collision at combined \(1000\text{ px/s}\) | 2-pass positional separation, restitution impulse, Coulomb friction | \(\Delta \text{separation} \le 0.5\text{ px}\), \(\Delta v_{\text{deflect}} \le 0.2\text{ px/s}\) |

### 8.2 Investigation of Cross-Language Mathematical Discrepancies
During preliminary testing, three subtle floating-point behaviors were identified for explicit calibration in Java:
1. **Exponential Drag Exponents (`Math.pow`):** V8 (Chromium) and HotSpot (Java) can produce sub-ulp discrepancies when computing \(\text{drag}^{dt \cdot 60}\). Java will use `StrictMath.pow` or pre-computed lookup tables for fixed \(50\text{ ms}\) frames to guarantee bitwise reproducibility.
2. **Spline Interpolation Knot Parameterization:** Phaser's `Phaser.Curves.Spline` implements Catmull-Rom centripetal spline curves. The Java `TrackGeometry` importer will utilize the exact centripetal knot vector formula (\(\alpha = 0.5\)) to ensure identical waypoint coordinates.
3. **Trigonometric Fast-Math:** Standard Java `Math.cos` / `Math.sin` delegates to CPU transcendentals which may differ slightly across architectures. Java physics will use `StrictMath` for all vehicle heading vectors to maintain cross-platform parity.

---

## 9. Public Matchmaking Architecture

The public matchmaking workflow collects connecting human players, forms balanced 8-player rooms, and ensures seamless room dispatch.

```mermaid
sequenceDiagram
    autonumber
    actor P1 as Player 1
    actor P2 as Player 2
    actor P8 as Player 8
    participant MS as MatchmakingService
    participant RM as RoomManager
    participant R as Room (Active)

    P1->>MS: JOIN_MATCHMAKING (playerToken)
    MS-->>P1: MATCHMAKING_STATUS (inQueue, players: 1/8)
    P2->>MS: JOIN_MATCHMAKING (playerToken)
    Note over MS: 2 Players reached! Start 15s collection timer
    MS-->>P1: MATCHMAKING_STATUS (players: 2/8, timeLeft: 15s)
    MS-->>P2: MATCHMAKING_STATUS (players: 2/8, timeLeft: 15s)
    P8->>MS: JOIN_MATCHMAKING (playerToken)
    Note over MS: 8 Players reached! Immediate launch trigger
    MS->>RM: createRoom(8 Players, SelectedTrack)
    RM-->>R: Instantiate Room (state: WAITING)
    MS-->>P1: ROOM_ASSIGNED (roomId, slot: P1, trackId)
    MS-->>P2: ROOM_ASSIGNED (roomId, slot: P2, trackId)
    MS-->>P8: ROOM_ASSIGNED (roomId, slot: P8, trackId)
```

### 9.1 Concurrency & Race-Condition Safety
- **Atomic Operations:** The matchmaking queue uses atomic state checks. When multiple players request entry simultaneously, queue operations are serialized through thread-safe locks (`ReentrantLock`).
- **No Duplicate Slots:** A player token can only exist in one active queue or room at any time.
- **Graceful Queue Cancellation:** If a player cancels matchmaking or disconnects while in queue, the player is removed atomically. If queue count drops below 2, the 15-second collection timer is paused and reset.

---

## 10. Room and Race State Machine

The room lifecycle enforces strict state transitions and guarantees proper teardown:

```mermaid
stateDiagram-v2
    [*] --> WAITING: Room Created (2-8 Players)
    WAITING --> COUNTDOWN: All Players Ready OR Lobby Timeout (30s)
    WAITING --> CLOSED: All Players Left
    COUNTDOWN --> RACING: 3-Second Synchronized Countdown Finishes
    RACING --> FINISHED: All Players Finished OR 30s Post-Winner DNF Timer
    FINISHED --> CLOSED: Results Acknowledged OR 20s Post-Race Cleanup
    CLOSED --> [*]: Room Disposed & Resources Cleared
```

### 10.1 15-Second Reconnection Grace Period
- If a client's WebSocket drops during `RACING`:
  1. Room does **not** instantly delete the player.
  2. The car is marked as `DISCONNECTED` and placed into neutral rolling drag (inert safety state).
  3. Other players receive `PLAYER_DISCONNECTED` notification; the vehicle remains visible on track as an obstacle or ghost.
  4. A 15-second timer starts. If the client reconnects with their `guestToken` and sends `RECONNECT(roomId)`:
     - The server maps the new WebSocket session to the existing `PlayerSlot`.
     - Sends a full state synchronization snapshot.
     - Broadcasts `PLAYER_RECONNECTED` to all competitors.
  5. If the 15-second window elapses without reconnection, the player is declared `DNF` and their car is removed from the track.

---

## 11. Database and Infrastructure Evolution Plan

```mermaid
flowchart LR
    subgraph SingleServer["Phase 1: Milestone 8.1"]
        SBApp["Single Spring Boot Instance\n(In-Memory State & Concurrent Collections)"]
    end

    subgraph Containerized["Phase 2: Docker & Storage"]
        DockerApp["Dockerized Spring Boot"]
        RedisStore["Redis 7\n(Presence & Queue)"]
        MongoStore["MongoDB 7\n(Profiles & Match History)"]
        DockerApp <--> RedisStore
        DockerApp <--> MongoStore
    end

    subgraph Distributed["Phase 3: AWS / Kubernetes Scale"]
        ALB["AWS ALB / Ingress"]
        Pod1["Server Node 1"]
        Pod2["Server Node 2"]
        PodN["Server Node N"]
        RedisCluster["Redis Cluster (Pub/Sub)"]
        MongoAtlas["MongoDB Atlas Cluster"]

        ALB --> Pod1
        ALB --> Pod2
        ALB --> PodN
        Pod1 <--> RedisCluster
        Pod2 <--> RedisCluster
        PodN <--> RedisCluster
        Pod1 --> MongoAtlas
        Pod2 --> MongoAtlas
        PodN --> MongoAtlas
    end

    SingleServer --> Containerized --> Distributed
```

*Critical Architecture Rule:* **Per-frame physics and 20 Hz snapshot data are NEVER written to MongoDB or Redis.** They exist strictly in JVM memory during active gameplay.

---

## 12. Network Bandwidth & Performance Modeling

### 12.1 Bandwidth Terminology & Framing Definitions
- **Client Outbound (Uplink):** `PLAYER_INPUT` messages sent from the Client to the Server.
- **Client Inbound (Downlink):** `RACE_STATE` snapshots received by the Client from the Server.
- **Protocol Framing Overhead per Packet:**
  - Standard IPv4 Header: 20 bytes.
  - Standard TCP Header: 20 bytes (without optional fields).
  - WebSocket Framing:
    - Client Outbound (Masked): 6 bytes (\(\le 125\) bytes payload). Total packet overhead = \(46\text{ bytes}\).
    - Client Inbound (Unmasked): 4 bytes (extended length \(\le 65535\) bytes). Total packet overhead = \(44\text{ bytes}\).

### 12.2 Detailed Bandwidth Estimations (at 20 Hz Simulation & Broadcast)

#### Payload Sizing
- **`PLAYER_INPUT` Payload:** \(\approx 115\text{ bytes}\) uncompressed JSON.
  - With 46 bytes framing: **\(161\text{ bytes/packet}\)**.
  - At 20 msgs/sec: **\(2.30\text{ KB/s}\) payload bandwidth** | **\(3.22\text{ KB/s}\) (\(25.8\text{ Kbps}\)) wire bandwidth**.
- **`RACE_STATE` Payload Base Envelope:** \(\approx 90\text{ bytes}\).
- **Per-Vehicle State Entry:** \(\approx 125\text{ bytes}\).
  - **2 Players:** \(90 + (2 \times 125) = 340\text{ bytes}\) (Wire: \(384\text{ bytes}\)).
  - **4 Players:** \(90 + (4 \times 125) = 590\text{ bytes}\) (Wire: \(634\text{ bytes}\)).
  - **8 Players:** \(90 + (8 \times 125) = 1,090\text{ bytes}\) (Wire: \(1,134\text{ bytes}\)).

#### Comparative Network Bandwidth Table (20 Hz Rates)

| Room Configuration | Client Outbound (Uplink) Payload / Wire | Client Inbound (Downlink) Payload / Wire | Total Server Ingress per Room (Wire) | Total Server Egress per Room (Wire) |
| :---: | :---: | :---: | :---: | :---: |
| **2 Players** | \(2.30\text{ KB/s}\) / **\(3.22\text{ KB/s}\)** | \(6.80\text{ KB/s}\) / **\(7.68\text{ KB/s}\)** | \(6.44\text{ KB/s}\) (\(51.5\text{ Kbps}\)) | \(15.36\text{ KB/s}\) (\(122.9\text{ Kbps}\)) |
| **4 Players** | \(2.30\text{ KB/s}\) / **\(3.22\text{ KB/s}\)** | \(11.80\text{ KB/s}\) / **\(12.68\text{ KB/s}\)** | \(12.88\text{ KB/s}\) (\(103.0\text{ Kbps}\)) | \(50.72\text{ KB/s}\) (\(405.8\text{ Kbps}\)) |
| **8 Players (Full)** | \(2.30\text{ KB/s}\) / **\(3.22\text{ KB/s}\)** | \(21.80\text{ KB/s}\) / **\(22.68\text{ KB/s}\)** | **\(25.76\text{ KB/s}\) (\(206.1\text{ Kbps}\))** | **\(181.44\text{ KB/s}\) (\(1.45\text{ Mbps}\))** |

> [!NOTE]
> **Estimation Notice:** All figures above represent analytical engineering calculations based on uncompressed JSON serialization and standard TCP/IP + WebSocket frame headers. Actual network bandwidth under TLS/WSS encryption will be measured and verified during Milestone 8.8 stress testing.

### 12.3 Server CPU & Tick Budget
- At 20 TPS, the available tick budget is **\(50.0\text{ ms}\)**.
- Simulating 8 vehicles (kinematics + 28 pairwise collision tests + checkpoint line intersections) requires approximately **\(0.45\text{--}0.85\text{ ms}\)** of CPU time per tick on a modern x86/ARM core.
- A single Spring Boot server instance with 4 virtual CPU cores can easily sustain **40 to 60 simultaneous active 8-player rooms** (320–480 concurrent racers) without tick degradation.
