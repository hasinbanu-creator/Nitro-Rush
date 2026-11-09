# Nitro Rush — Headless Java Physics Engine Specification

## 1. Executive Summary

The Nitro Rush Headless Java Physics Engine is an authoritative, server-side simulation package designed to mirror the client-side TypeScript vehicle physics with machine-precision floating-point conformance. Operating at a fixed timestep of 50 ms ($\Delta t = 0.050\text{ s}$, 20 TPS), the physics engine models longitudinal traction, weight-sensitive braking, a deliberate reverse-gear engagement transmission, 2D lateral tire slip, drift yaw damping, mini-turbo qualification, aerodynamic drag, canvas boundary rebounds, and a 2-pass vehicle collision solver.

---

## 2. Package Architecture

The physics package is organized under `com.nitrorush.backend.physics`:

```
com.nitrorush.backend.physics/
├── config/
│   ├── PhysicsConstants.java       # Global constants, tolerances, and thresholds
│   ├── VehicleConfig.java          # Vehicle configuration model
│   ├── VehicleStats.java           # Car statistics (top speed, accel, handling, nitro)
│   ├── NitroConfig.java            # Nitro capacity, burn/regen rates, multipliers
│   ├── HandlingConfig.java         # Drift retention, grip, turn multiplier, agility
│   ├── TrackPhysicsConfig.java     # Surface multipliers, off-road drag & penalties
│   └── VehicleRegistry.java        # Thread-safe registry loading vehicles from JSON
├── model/
│   ├── Vector2D.java               # 2D double-precision vector operations
│   ├── SurfaceType.java            # Surface type enumeration
│   ├── PlayerInput.java            # Validated, immutable normalized tick inputs
│   └── VehicleState.java           # Full kinematic & transmission vehicle state
├── track/
│   ├── TrackWaypoint.java          # Waypoint coordinates (x, y)
│   ├── TrackCheckpoint.java        # Checkpoint indices, angles, and widths
│   ├── GridSlot.java               # Starting grid slot positions & orientations
│   ├── TrackDefinition.java        # Complete track definition model
│   └── TrackRegistry.java          # Thread-safe registry loading tracks from JSON
├── collision/
│   └── CollisionEngine.java        # 2-pass arcade collision & momentum resolver
├── engine/
│   ├── PhysicsEngine.java          # Authoritative single-tick vehicle simulation
│   └── FixedTimestepRunner.java    # Accumulator runner with spiral-of-death policy
└── simulation/
    └── RaceSimulationWorld.java    # Multi-vehicle race simulation orchestrator
```

---

## 3. Mathematical Model & Update Order

Each vehicle simulation tick processes inputs and kinematics through ten sequential operations:

### Step 1: Chassis Coordinate Frame Projection
Velocity is projected onto the chassis heading vector $\vec{F} = (\cos\theta, \sin\theta)$ and perpendicular right vector $\vec{R} = (-\sin\theta, \cos\theta)$:
$$v_{\text{fwd}} = \vec{v} \cdot \vec{F} = v_x \cos\theta + v_y \sin\theta$$
$$v_{\text{lat}} = \vec{v} \cdot \vec{R} = -v_x \sin\theta + v_y \cos\theta$$

### Step 2: Nitro Boost & Effective Performance Scaling
- Nitro is consumed when `nitro == true`, `nitroAmount > 0`, `throttle > 0`, and vehicle is not in reverse:
  $$\text{nitroAmount} \leftarrow \max(0, \text{nitroAmount} - \text{burnRate} \cdot \Delta t)$$
- Otherwise, passive regeneration applies:
  $$\text{nitroAmount} \leftarrow \min(\text{maxNitro}, \text{nitroAmount} + \text{regenRate} \cdot \Delta t)$$
- Target forward top speed and acceleration:
  $$v_{\max} = \text{isNitroActive} ? (v_{\text{fwd,\max}} \cdot m_{\text{nitro}}) : v_{\text{fwd,\max}}$$
  $$a_{\text{eff}} = \text{isNitroActive} ? (a_{\text{base}} \cdot m_{a,\text{nitro}}) : a_{\text{base}} \cdot m_{a,\text{track}}$$

### Step 3: Throttle, Braking & Reverse Transmission
- **Braking**: When $v_{\text{fwd}} > 8.0\text{ px/s}$, active deceleration applies with weight-sensitive braking rate:
  $$a_{\text{brake}} = 840 \cdot (1250 / \text{mass})^{0.70} \cdot m_{\text{brake,\ track}}$$
- **Reverse Engagement Threshold**: If stopped ($|v_{\text{fwd}}| \le 8.0\text{ px/s}$), reverse gear engages only after holding brake continuously for $220\text{ ms}$ ($t_{\text{hold}} \ge 0.22\text{ s}$). Once engaged:
  $$v_{\text{fwd}} \leftarrow v_{\text{fwd}} - (a_{\text{base}} \cdot 0.55) \cdot \text{brake} \cdot \Delta t \quad [\text{clamped to } -0.28 \cdot v_{\text{fwd,\max}}]$$
- **Reverse Exit**: Applying throttle while in reverse acts as active braking to bring forward velocity back to 0, cleanly disengaging reverse gear.

### Step 4: Steering Ease Curve & Yaw Damping
- Low-speed steering agility ease-out curve prevents twitchiness at low velocities:
  $$s_{\text{ratio}} = \min(1.0, \|\vec{v}\| / 140.0)$$
  $$\text{ease} = \sin(s_{\text{ratio}} \cdot \frac{\pi}{2})$$
  $$k_{\text{steer}} = \|\vec{v}\| < 5.0 ? 0.0 : \text{agility}_{\min} + (1.0 - \text{agility}_{\min}) \cdot \text{ease}$$
- **Drift Yaw Damping**:
  - When drifting with drift angle $> 24^\circ$:
    - If counter-steering ($v_{\text{lat}} \cdot \text{steer} > 0$): $\text{yawDamping} = 1.30$.
    - If steering into drift: $\text{yawDamping} = \max(0.10, 1.0 - (\theta_{\text{drift}} - 24) / 12.0)$ (powerslide stabilization).
- Rotation integration:
  $$\theta \leftarrow \theta + \text{steer} \cdot \omega_{\text{turn}} \cdot k_{\text{steer}} \cdot \text{reverseDir} \cdot \Delta t$$

### Step 5: True 2D Lateral Momentum & Drift Slip
World momentum is projected into the updated chassis orientation:
$$v_{\text{fwd}}' = \vec{v}_{\text{curr}} \cdot \vec{F}_{\text{new}}$$
$$v_{\text{lat}}' = \vec{v}_{\text{curr}} \cdot \vec{R}_{\text{new}}$$
Lateral tire friction factor $\mu_{\text{lat}}$ reduces lateral velocity while retaining controlled slip:
$$v_{\text{lat}}' \leftarrow v_{\text{lat}}' \cdot \mu_{\text{lat}}^{\Delta t \cdot 60}$$
Deadzone: If $|v_{\text{lat}}'| < 2.0\text{ px/s}$, $v_{\text{lat}}' = 0.0$.

### Step 6: Mini-Turbo Reward System
- When drifting with $\|\vec{v}\| > 100\text{ px/s}$, drift duration accumulates: $t_{\text{drift}} \leftarrow t_{\text{drift}} + \Delta t$.
- If active slip ($|v_{\text{lat}}| > 45\text{ px/s}$ or $\theta_{\text{drift}} \ge 12^\circ$) is sustained for $\ge 0.35\text{ s}$, drift qualifies.
- Upon drift exit with $t_{\text{drift}} \ge 0.55\text{ s}$, $\|\vec{v}\| > 90\text{ px/s}$, and alignment $\theta_{\text{drift}} < 12^\circ$:
  $$\text{nitroAmount} \leftarrow \min(\text{maxCapacity}, \text{nitroAmount} + 15.0)$$

### Step 7: World Velocity Reconstruction & Drag
Velocity components are rotated back to world space, and aerodynamic drag is applied:
$$\vec{v} = v_{\text{fwd}}' \vec{F}_{\text{new}} + v_{\text{lat}}' \vec{R}_{\text{new}}$$
$$\vec{v} \leftarrow \vec{v} \cdot C_{\text{drag}}^{\Delta t \cdot 60}$$

### Step 8: Position Integration & World Border Reflection
$$\vec{x} \leftarrow \vec{x} + \vec{v} \cdot \Delta t$$
Boundaries enforce a 50 px margin with $e = 0.32$ velocity reflection:
- If $x < 50$: $x = 50, v_x = |v_x| \cdot 0.32$
- If $x > W - 50$: $x = W - 50, v_x = -|v_x| \cdot 0.32$
- If $y < 50$: $y = 50, v_y = |v_y| \cdot 0.32$
- If $y > H - 50$: $y = H - 50, v_y = -|v_y| \cdot 0.32$

### Step 9: HUD Speed Calculation
$$v_{\text{KM/H}} = \text{round}(\|\vec{v}\| \times 0.40)$$

---

## 4. 2-Pass Arcade Vehicle Collision Engine

Resolves vehicle-to-vehicle overlap and exchanges momentum for packs of up to 8 vehicles:

### Pass 1: Overlap Displacement & Impulse Exchange
1. Pairwise test: $d^2 < 44^2$ ($D = 44\text{ px}$, $R = 22\text{ px}$).
2. Mass weighting: $w_A = m_B / (m_A + m_B)$, $w_B = m_A / (m_A + m_B)$.
3. Separation: $\text{sep} = (44 - d) \cdot 1.02$.
   $$\vec{x}_A \leftarrow \vec{x}_A - \vec{n} \cdot \text{sep} \cdot w_A, \quad \vec{x}_B \leftarrow \vec{x}_B + \vec{n} \cdot \text{sep} \cdot w_B$$
4. Normal relative velocity $v_n = (\vec{v}_B - \vec{v}_A) \cdot \vec{n}$. If $v_n < 0$:
   - Restitution: $e = \max(0.20, 0.35 - |v_n| \cdot 0.00012)$.
   - Normal impulse: $J_n = \min(-(1 + e) v_n, \max(420, |v_n| \cdot 1.25))$.
   - Apply: $\vec{v}_A -= \vec{n} J_n w_A, \quad \vec{v}_B += \vec{n} J_n w_B$.
5. Tangential Coulomb friction along $\vec{t} = (-n_y, n_x)$:
   - $f_{\text{mag}} = \min(|v_t| \cdot 0.35, J_n \cdot 0.18)$.
   - $J_t = -\text{sign}(v_t) \cdot f_{\text{mag}}$.
   - Apply: $\vec{v}_A -= \vec{t} J_t w_A, \quad \vec{v}_B += \vec{t} J_t w_B$.
6. Metal grinding scrub:
   - $\gamma = \min(0.035, (J_n / 1000) \cdot 0.02)$. If $\gamma > 0.001$: $\vec{v} \leftarrow \vec{v} (1 - \gamma w)$.
7. Angular rotational deflection:
   - $\Delta \theta_A = (\vec{v}_A \cdot \vec{t}) \cdot 0.0006 \cdot w_A \cdot 2.0$
   - $\Delta \theta_B = -(\vec{v}_A \cdot \vec{t}) \cdot 0.0006 \cdot w_B \cdot 2.0$

### Pass 2: Positional Relaxation Solver
Performs secondary separation without applying velocity impulses, eliminating high-density pack jitter and double-kick artifacts.

---

## 5. Fixed Timestep Runner & Overload Policy

- **Fixed Timestep**: 50 ms ($\Delta t = 0.050\text{ s}$).
- **Accumulator**: Wall-clock elapsed time is added to accumulator.
- **Spiral-of-Death Protection**: Clamped to a maximum of $250\text{ ms}$ (5 ticks). If server experiences sudden load spikes or thread stalls, excess time is safely dropped rather than triggering infinite catch-up loops.

