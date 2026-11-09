# Nitro Rush — Milestone 8.2 Physics Conformance & Verification Report

## 1. Conformance Overview

Milestone 8.2 establishes the headless Java 21 physics engine for Nitro Rush with strict tick-by-tick cross-language mathematical conformance against the TypeScript reference implementation.

The conformance suite extracted golden vectors directly from the real TypeScript `CarController.ts` and `RaceScene.ts` collision solver running in Node.js, recording 101 states (ticks 0 through 100) across 9 distinct gameplay scenarios.

Every scenario was compared tick-by-tick across all 100 ticks against strict acceptance criteria:
- **Position Tolerance**: $\le 0.5\text{ pixels}$
- **Velocity Tolerance**: $\le 0.1\text{ px/s}$
- **Heading Angle Tolerance**: $\le 0.005\text{ radians}$
- **Nitro Fuel Tolerance**: $\le 0.1\text{ percentage points}$

---

## 2. Cross-Language Conformance Results

Across all 9 scenarios and 909 compared simulation states, the Java physics engine matched the TypeScript reference engine within machine-precision floating-point epsilon:

| Scenario | Tested Dynamics | Max Pos Diff (px) | Max Vel Diff (px/s) | Max Heading Diff (rad) | Max Nitro Diff (%) | Conformance Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **1. Straight Accel** | Throttle 1.0 from standstill, 100 ticks | $0.000000$ | $0.000000$ | $0.000000$ | $0.000000$ | **PASS (Exact Bitwise)** |
| **2. Braking** | Deceleration from 600 px/s, 100 ticks | $0.000000$ | $0.000000$ | $0.000000$ | $0.000000$ | **PASS (Exact Bitwise)** |
| **3. Reverse Transition** | 220ms deadzone hold, reverse accel, forward throttle recovery | $0.000000$ | $0.000000$ | $0.000000$ | $0.000000$ | **PASS (Exact Bitwise)** |
| **4. Steering & Turning** | Low-speed agility ease curve, turnRate | $2.27 \times 10^{-13}$ | $6.94 \times 10^{-13}$ | $0.000000$ | $0.000000$ | **PASS ($< 10^{-12}$)** |
| **5. Drift & Counter-Steer** | Powerslide stabilization, yaw damping, counter-steer | $8.20 \times 10^{-13}$ | $8.24 \times 10^{-13}$ | $1.78 \times 10^{-15}$ | $0.000000$ | **PASS ($< 10^{-12}$)** |
| **6. Nitro Burn & Regen** | Active boost consumption + passive recharge | $0.000000$ | $0.000000$ | $0.000000$ | $0.000000$ | **PASS (Exact Bitwise)** |
| **7. Mini-Turbo** | Drift slip $\ge 0.35$s, exit $\ge 0.55$s, $+15\%$ boost at tick 18 | $0.000000$ | $2.29 \times 10^{-13}$ | $0.000000$ | $0.000000$ | **PASS ($< 10^{-12}$)** |
| **8. Off-Road Handling** | Off-road drag & speed cap, AWD bonus on Rally Apex | $0.000000$ | $0.000000$ | $0.000000$ | $0.000000$ | **PASS (Exact Bitwise)** |
| **9. Multi-Car Collision** | Pairwise impulse, tangential friction, scrub, border rebound | $1.14 \times 10^{-13}$ | $4.27 \times 10^{-14}$ | $2.22 \times 10^{-16}$ | $0.000000$ | **PASS ($< 10^{-13}$)** |

> [!NOTE]
> All observed differences are on the order of $10^{-13}$ to $10^{-16}$ (standard IEEE-754 double precision roundoff). This is **12 orders of magnitude tighter** than the required tolerances.

---

## 3. Performance Benchmark & Headroom Analysis

Measured on an Apple Silicon host running Java 21 LTS over 1,000 authoritative simulation ticks following a 500-tick JIT warmup:

| Vehicle Count | Mean Tick Duration | P95 Tick Duration | P99 Tick Duration | Max Tick Duration | 50ms Budget Consumed | Headroom Multiplier |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **2 Vehicles** | **3.20 µs** | 6.63 µs | 14.13 µs | 46.38 µs | **0.0064%** | **15,625x** |
| **4 Vehicles** | **3.38 µs** | 4.79 µs | 14.92 µs | 78.13 µs | **0.0068%** | **14,792x** |
| **8 Vehicles** | **5.99 µs** | 6.88 µs | 15.92 µs | 301.29 µs | **0.0120%** | **8,347x** |

### Key Performance Insights
1. **Ultra-Low Latency**: An 8-player full race tick takes **5.99 microseconds** on average.
2. **Massive Capacity**: A single server thread can simulate over **8,000 vehicles** (or 1,000 simultaneous 8-player races) within a single 50 ms tick window.
3. **P99 Predictability**: P99 tick duration remains under **16 microseconds** even under full 8-car collision density.

---

## 4. Regression & Stability Matrix

1. **$4 \times 9$ Vehicle-Track Matrix (36 Combinations)**:
   - Vehicles: Bolt GT, Viper-R, Rally Apex, Titan V8.
   - Tracks: Coastal Rush, City Nights, Mountain Pass, Desert Heat, Forest Trail, Snow Peaks, Volcano Run, Rural Village, Space Station.
   - All 36 combinations simulated for 100 ticks under dynamic throttle, braking, steering, drift, and nitro inputs.
   - Verified zero NaN, zero Inf, positions strictly bounded within canvas boundaries, and speeds bounded within vehicle limits.
2. **Bitwise Determinism**:
   - Two isolated `RaceSimulationWorld` instances executed for 200 ticks with identical input sequences.
   - Every single state parameter (`x, y, vx, vy, rotation, nitro`) verified bitwise identical via `Double.doubleToLongBits()`.
3. **Input Sanitization**:
   - Negative, exceeding, NaN, and Infinite inputs clamped and sanitized without exceptions.
4. **Boundary Reflection**:
   - All 4 world borders tested; restitution coefficient ($e = 0.32$) verified.
5. **Fixed Timestep Overload Protection**:
   - Clamped accumulator to $250\text{ ms}$ (5 ticks max catch-up) upon 10-second artificial lag spikes, eliminating spiral-of-death runaway.

