import type { DifficultyId } from '../state/SelectionState';

export interface RaceCheckpoint {
  index: number;
  x: number;
  y: number;
  angle: number; // Forward heading angle of circuit at checkpoint
  width: number;
}

export interface CompetitorConfig {
  id: string;
  name: string;
  carId: string;
  carName: string;
  isPlayer: boolean;
}

export interface CompetitorState {
  id: string;
  name: string;
  carId: string;
  carName: string;
  isPlayer: boolean;

  // Progression
  currentLap: number;
  nextCheckpointIndex: number;
  checkpointsClearedInLap: Set<number>;
  hasCrossedStartLine: boolean;

  // Timings in milliseconds
  currentLapTime: number;
  previousLapTime: number;
  bestLapTime: number;
  totalRaceTime: number;
  lapTimes: number[];

  // Finish & Standings
  isFinished: boolean;
  finishPosition: number; // 1, 2, 3, 4 (0 if still racing)
  finishTimeMs: number;

  // Live progress metrics
  progressScore: number;
  distanceToNextCp: number;
}

export interface CompetitorResult {
  id: string;
  name: string;
  carId: string;
  carName: string;
  isPlayer: boolean;
  finishPosition: number;
  isFinished: boolean;
  totalTimeMs: number;
  bestLapMs: number;
  lapTimesMs: number[];
  status: 'FINISHED' | 'DNF';
}

export interface RaceResultData {
  trackId: string;
  trackName: string;
  carId: string;
  carName: string;
  difficulty: DifficultyId;
  totalTimeMs: number;
  bestLapMs: number;
  lapTimesMs: number[];
  playerPosition: number;
  competitors: CompetitorResult[];
}

export function formatLapTime(timeMs: number): string {
  if (timeMs <= 0 || !isFinite(timeMs)) return '--:--.---';
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(timeMs % 1000);

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const mmm = millis.toString().padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

export class RaceManager {
  public checkpoints: RaceCheckpoint[] = [];
  public readonly totalLaps: number = 3;

  // Competitors tracking
  public competitors: Map<string, CompetitorState> = new Map();
  public finishedCompetitors: CompetitorState[] = [];

  // Convenience aliases for player (preserves Milestone 4B API compatibility)
  public currentLap: number = 1;
  public nextCheckpointIndex: number = 0;
  public checkpointsClearedInLap: Set<number> = new Set();
  public hasCrossedStartLine: boolean = false;
  public currentLapTime: number = 0;
  public previousLapTime: number = 0;
  public bestLapTime: number = 0;
  public totalRaceTime: number = 0;
  public lapTimes: number[] = [];

  // State flags
  public isTimerActive: boolean = false;
  public isRaceFinished: boolean = false;
  public isWrongWay: boolean = false;
  private wrongWayTimer: number = 0;

  // Metadata
  public trackId: string;
  public trackName: string;
  public carId: string;
  public carName: string;
  public difficulty: DifficultyId;

  // Callbacks
  public onCheckpointCleared?: (cpIndex: number, totalCheckpoints: number) => void;
  public onLapCompleted?: (lapNumber: number, lapTimeMs: number, isBest: boolean) => void;
  public onFinalLap?: () => void;
  public onRaceFinished?: (results: RaceResultData) => void;
  public onCompetitorFinished?: (competitor: CompetitorState, position: number) => void;

  constructor(config: {
    checkpoints: RaceCheckpoint[];
    trackId: string;
    trackName: string;
    carId: string;
    carName: string;
    difficulty: DifficultyId;
    competitors?: CompetitorConfig[];
  }) {
    this.checkpoints = config.checkpoints;
    this.trackId = config.trackId;
    this.trackName = config.trackName;
    this.carId = config.carId;
    this.carName = config.carName;
    this.difficulty = config.difficulty;

    // Register competitors (Player is always registered)
    const initialCompetitors = config.competitors || [
      { id: 'player', name: 'YOU', carId: config.carId, carName: config.carName, isPlayer: true },
    ];

    for (const comp of initialCompetitors) {
      this.competitors.set(comp.id, {
        id: comp.id,
        name: comp.name,
        carId: comp.carId,
        carName: comp.carName,
        isPlayer: comp.isPlayer,
        currentLap: 1,
        nextCheckpointIndex: 0,
        checkpointsClearedInLap: new Set<number>(),
        hasCrossedStartLine: false,
        currentLapTime: 0,
        previousLapTime: 0,
        bestLapTime: 0,
        totalRaceTime: 0,
        lapTimes: [],
        isFinished: false,
        finishPosition: 0,
        finishTimeMs: 0,
        progressScore: 0,
        distanceToNextCp: 0,
      });
    }
  }

  /**
   * Starts race timing when the starting lights turn GO!
   */
  public startRace(): void {
    this.isTimerActive = true;
    this.isRaceFinished = false;
    this.finishedCompetitors = [];

    // Reset all competitors
    for (const state of this.competitors.values()) {
      state.currentLap = 1;
      state.nextCheckpointIndex = 0;
      state.checkpointsClearedInLap.clear();
      state.hasCrossedStartLine = false;
      state.currentLapTime = 0;
      state.previousLapTime = 0;
      state.bestLapTime = 0;
      state.totalRaceTime = 0;
      state.lapTimes = [];
      state.isFinished = false;
      state.finishPosition = 0;
      state.finishTimeMs = 0;
      state.progressScore = 0;
    }

    this.syncPlayerState();
  }

  /**
   * Main per-frame update for player vehicle
   */
  public update(
    dt: number,
    carX: number,
    carY: number,
    prevX: number,
    prevY: number,
    carHeading?: number
  ): void {
    if (!this.isTimerActive) return;

    const playerState = this.competitors.get('player');
    if (!playerState) return;

    if (!playerState.isFinished) {
      const deltaMs = dt * 1000;
      playerState.currentLapTime += deltaMs;
      playerState.totalRaceTime += deltaMs;

      // Check wrong way driving relative to current checkpoint
      this.checkWrongWay(dt, carX, carY, prevX, prevY, carHeading);

      // Test checkpoint crossing for player
      this.testCompetitorCheckpointCrossing(playerState, carX, carY, prevX, prevY);
    }

    // Update player live score and distance to next checkpoint
    this.updateCompetitorProgressScore(playerState, carX, carY);

    this.syncPlayerState();
  }

  /**
   * Per-frame update for AI opponent vehicles
   */
  public updateAI(
    aiId: string,
    dt: number,
    carX: number,
    carY: number,
    prevX: number,
    prevY: number
  ): void {
    if (!this.isTimerActive) return;

    const aiState = this.competitors.get(aiId);
    if (!aiState || aiState.isFinished) return;

    const deltaMs = dt * 1000;
    aiState.currentLapTime += deltaMs;
    aiState.totalRaceTime += deltaMs;

    // Test checkpoint crossings for this AI opponent
    this.testCompetitorCheckpointCrossing(aiState, carX, carY, prevX, prevY);

    // Update AI live progress score
    this.updateCompetitorProgressScore(aiState, carX, carY);
  }

  /**
   * Tests whether a competitor (player or AI) crossed their next required checkpoint
   */
  private testCompetitorCheckpointCrossing(
    comp: CompetitorState,
    carX: number,
    carY: number,
    prevX: number,
    prevY: number
  ): void {
    if (this.checkpoints.length === 0) return;

    // 1. Initial Race Start Line Crossing (moving forward from grid across CP 0)
    if (!comp.hasCrossedStartLine) {
      const cp0 = this.checkpoints[0];
      if (this.isCrossingGate(prevX, prevY, carX, carY, cp0, true)) {
        comp.hasCrossedStartLine = true;
        comp.nextCheckpointIndex = 1;
        comp.checkpointsClearedInLap.add(0);

        if (comp.isPlayer) {
          this.onCheckpointCleared?.(0, this.checkpoints.length);
        }
        return;
      }
    }

    // 2. Sequential Checkpoint Validation
    const targetCp = this.checkpoints[comp.nextCheckpointIndex];
    if (!targetCp) return;

    // Must cross strictly in forward direction
    const crossedForward = this.isCrossingGate(prevX, prevY, carX, carY, targetCp, true);

    if (crossedForward) {
      if (targetCp.index === 0 && comp.hasCrossedStartLine) {
        // CP 0 crossed after all other checkpoints were cleared -> Lap Complete!
        const requiredOthers = this.checkpoints.length - 1;
        if (comp.checkpointsClearedInLap.size >= requiredOthers) {
          this.completeCompetitorLap(comp);
        }
      } else {
        // Intermediate checkpoint cleared in correct order
        comp.checkpointsClearedInLap.add(targetCp.index);

        if (comp.isPlayer) {
          this.onCheckpointCleared?.(targetCp.index, this.checkpoints.length);
        }

        // Advance next required checkpoint sequentially
        comp.nextCheckpointIndex = (comp.nextCheckpointIndex + 1) % this.checkpoints.length;
      }
    }
  }

  /**
   * Completes a lap for a competitor
   */
  private completeCompetitorLap(comp: CompetitorState): void {
    const lapTime = comp.currentLapTime;
    comp.lapTimes.push(lapTime);
    comp.previousLapTime = lapTime;

    const isBest = comp.bestLapTime === 0 || lapTime < comp.bestLapTime;
    if (isBest) {
      comp.bestLapTime = lapTime;
    }

    if (comp.isPlayer) {
      this.onLapCompleted?.(comp.currentLap, lapTime, isBest);
    }

    if (comp.currentLap >= this.totalLaps) {
      // Competitor has finished the race!
      comp.isFinished = true;
      this.finishedCompetitors.push(comp);
      comp.finishPosition = this.finishedCompetitors.length;
      comp.finishTimeMs = comp.totalRaceTime;

      this.onCompetitorFinished?.(comp, comp.finishPosition);

      if (comp.isPlayer) {
        this.isRaceFinished = true;
        this.onRaceFinished?.(this.getRaceResult());
      } else if (this.finishedCompetitors.length === this.competitors.size) {
        // All competitors finished
        this.isRaceFinished = true;
        this.isTimerActive = false;
        this.onRaceFinished?.(this.getRaceResult());
      }
    } else {
      // Advance to next lap
      comp.currentLap++;
      comp.currentLapTime = 0;
      comp.checkpointsClearedInLap.clear();
      comp.checkpointsClearedInLap.add(0);
      comp.nextCheckpointIndex = 1;

      if (comp.isPlayer && comp.currentLap === this.totalLaps) {
        this.onFinalLap?.();
      }
    }
  }

  /**
   * Calculates continuous real-time progress score for live leaderboard ranking
   */
  private updateCompetitorProgressScore(comp: CompetitorState, carX: number, carY: number): void {
    if (this.checkpoints.length === 0) return;

    const targetCp = this.checkpoints[comp.nextCheckpointIndex] || this.checkpoints[0];
    const distToCp = Math.hypot(targetCp.x - carX, targetCp.y - carY);
    comp.distanceToNextCp = distToCp;

    if (comp.isFinished) {
      // Finished competitors have fixed maximum score based on finish position (1st > 2nd > 3rd > 4th)
      comp.progressScore = 1000000 - comp.finishPosition * 10000;
    } else {
      // Higher lap = higher base score
      // More checkpoints cleared = higher sector score
      // Closer to next checkpoint = higher fractional bonus
      const lapWeight = (comp.currentLap - 1) * 20000;
      const cpWeight = comp.checkpointsClearedInLap.size * 1000;
      const proximityBonus = Math.max(0, 1000 - distToCp);
      comp.progressScore = lapWeight + cpWeight + proximityBonus;
    }
  }

  /**
   * Returns live race order of all 4 competitors sorted 1st to 4th
   */
  public getLeaderboard(): CompetitorState[] {
    const list = Array.from(this.competitors.values());

    return list.sort((a, b) => {
      // If both finished, sort by finish position
      if (a.isFinished && b.isFinished) {
        return a.finishPosition - b.finishPosition;
      }
      // If one finished, it's ahead
      if (a.isFinished) return -1;
      if (b.isFinished) return 1;

      // Otherwise sort by continuous progress score
      return b.progressScore - a.progressScore;
    });
  }

  /**
   * Returns the player's current live standing (1, 2, 3, or 4)
   */
  public getPlayerPosition(): number {
    const leaderboard = this.getLeaderboard();
    const idx = leaderboard.findIndex((c) => c.isPlayer);
    return idx >= 0 ? idx + 1 : 1;
  }

  /**
   * Checks whether vehicle trajectory intersects the checkpoint gate line segment
   */
  private isCrossingGate(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cp: RaceCheckpoint,
    requireForward: boolean
  ): boolean {
    const halfW = cp.width / 2;
    const cos = Math.cos(cp.angle);
    const sin = Math.sin(cp.angle);
    const normalX = -sin;
    const normalY = cos;

    // Lateral tolerance allows legitimate wide drift exits onto rumble strips and road shoulders (~halfW + 36px)
    // while strictly preventing cutting across the infield (infield gaps are 300px+)
    const lateralTolerance = Math.max(36, Math.round(halfW * 0.52));
    const gateHalfWidth = halfW + lateralTolerance;

    // Gate Left and Right endpoints in world space
    const gx1 = cp.x - normalX * gateHalfWidth;
    const gy1 = cp.y - normalY * gateHalfWidth;
    const gx2 = cp.x + normalX * gateHalfWidth;
    const gy2 = cp.y + normalY * gateHalfWidth;

    // Test line segment intersection between [P1, P2] and [G1, G2]
    const intersects = this.lineSegmentsIntersect(x1, y1, x2, y2, gx1, gy1, gx2, gy2);

    // Fallback: proximity gate plane crossing (for high-speed frame leaps across plane)
    let planeCrossed = false;
    const d1 = (x1 - cp.x) * cos + (y1 - cp.y) * sin;
    const d2 = (x2 - cp.x) * cos + (y2 - cp.y) * sin;
    if ((d1 <= 4 && d2 > -1 && d2 > d1) || (d1 < 0 && d2 >= 0)) {
      const latDist = Math.abs((x2 - cp.x) * normalX + (y2 - cp.y) * normalY);
      if (latDist <= gateHalfWidth + 6) {
        planeCrossed = true;
      }
    }

    if (!intersects && !planeCrossed) return false;

    if (requireForward) {
      const moveX = x2 - x1;
      const moveY = y2 - y1;
      const dot = moveX * cos + moveY * sin;
      return dot > 0.01;
    }

    return true;
  }

  /**
   * Standard 2D line segment intersection algorithm
   */
  private lineSegmentsIntersect(
    p0_x: number,
    p0_y: number,
    p1_x: number,
    p1_y: number,
    p2_x: number,
    p2_y: number,
    p3_x: number,
    p3_y: number
  ): boolean {
    const s1_x = p1_x - p0_x;
    const s1_y = p1_y - p0_y;
    const s2_x = p3_x - p2_x;
    const s2_y = p3_y - p2_y;

    const denom = -s2_x * s1_y + s1_x * s2_y;
    if (Math.abs(denom) < 0.00001) return false;

    const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denom;
    const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denom;

    return s >= 0 && s <= 1 && t >= 0 && t <= 1;
  }

  /**
   * Detects if player is driving backwards or facing backwards relative to track direction
   */
  private checkWrongWay(
    dt: number,
    carX: number,
    carY: number,
    prevX: number,
    prevY: number,
    carHeading?: number
  ): void {
    const targetCp = this.checkpoints[this.nextCheckpointIndex] || this.checkpoints[0];
    if (!targetCp) return;

    const moveX = carX - prevX;
    const moveY = carY - prevY;
    const speedSq = moveX * moveX + moveY * moveY;

    const cos = Math.cos(targetCp.angle);
    const sin = Math.sin(targetCp.angle);

    let isMovingBackwards = false;
    if (speedSq > 4) {
      const dot = moveX * cos + moveY * sin;
      isMovingBackwards = dot < -0.1;
    }

    let isFacingBackwards = false;
    if (carHeading !== undefined) {
      const headingDot = Math.cos(carHeading) * cos + Math.sin(carHeading) * sin;
      isFacingBackwards = headingDot < -0.3;
    }

    if (isMovingBackwards || isFacingBackwards) {
      this.wrongWayTimer = 1.0;
      this.isWrongWay = true;
    } else if (this.wrongWayTimer > 0) {
      this.wrongWayTimer -= dt;
      this.isWrongWay = this.wrongWayTimer > 0;
    } else {
      this.isWrongWay = false;
    }
  }

  /**
   * Synchronizes public player fields with the player competitor state
   */
  private syncPlayerState(): void {
    const p = this.competitors.get('player');
    if (!p) return;

    this.currentLap = p.currentLap;
    this.nextCheckpointIndex = p.nextCheckpointIndex;
    this.checkpointsClearedInLap = p.checkpointsClearedInLap;
    this.hasCrossedStartLine = p.hasCrossedStartLine;
    this.currentLapTime = p.currentLapTime;
    this.previousLapTime = p.previousLapTime;
    this.bestLapTime = p.bestLapTime;
    this.totalRaceTime = p.totalRaceTime;
    this.lapTimes = p.lapTimes;
  }

  /**
   * Current lap progress percentage (0 to 100%)
   */
  public getLapProgressPercent(): number {
    const total = this.checkpoints.length;
    if (total === 0) return 0;
    return Math.min(100, Math.round((this.checkpointsClearedInLap.size / total) * 100));
  }

  /**
   * Overall race progress percentage across all 3 laps (0 to 100%)
   */
  public getTotalRaceProgressPercent(): number {
    const totalCpsInRace = this.totalLaps * this.checkpoints.length;
    if (totalCpsInRace === 0) return 0;
    const clearedCps = (this.currentLap - 1) * this.checkpoints.length + this.checkpointsClearedInLap.size;
    return Math.min(100, Math.round((clearedCps / totalCpsInRace) * 100));
  }

  /**
   * Generates final official 4-competitor classification payload
   */
  public getRaceResult(): RaceResultData {
    const leaderboard = this.getLeaderboard();

    // Map all 4 competitors to official classification results
    const competitorResults: CompetitorResult[] = leaderboard.map((comp, idx) => {
      const position = comp.isFinished ? comp.finishPosition : idx + 1;
      const isFin = comp.isFinished;

      return {
        id: comp.id,
        name: comp.name,
        carId: comp.carId,
        carName: comp.carName,
        isPlayer: comp.isPlayer,
        finishPosition: position,
        isFinished: isFin,
        totalTimeMs: isFin ? comp.finishTimeMs : comp.totalRaceTime,
        bestLapMs: comp.bestLapTime,
        lapTimesMs: [...comp.lapTimes],
        status: isFin ? 'FINISHED' : 'DNF',
      };
    });

    const playerComp = this.competitors.get('player');
    const playerPosition = playerComp ? (playerComp.finishPosition || this.getPlayerPosition()) : 1;

    return {
      trackId: this.trackId,
      trackName: this.trackName,
      carId: this.carId,
      carName: this.carName,
      difficulty: this.difficulty,
      totalTimeMs: playerComp ? playerComp.totalRaceTime : this.totalRaceTime,
      bestLapMs: playerComp ? playerComp.bestLapTime : this.bestLapTime,
      lapTimesMs: playerComp ? [...playerComp.lapTimes] : [...this.lapTimes],
      playerPosition,
      competitors: competitorResults,
    };
  }
}
