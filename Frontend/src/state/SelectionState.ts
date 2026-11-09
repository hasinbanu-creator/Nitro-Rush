export type DifficultyId = 'EASY' | 'MEDIUM' | 'HARD';

export interface DifficultyConfig {
  id: DifficultyId;
  name: string;
  tagline: string;
  description: string;
  aiAggression: string;
  nitroBonus: string;
  color: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  EASY: {
    id: 'EASY',
    name: 'CASUAL RACER',
    tagline: 'FORGIVING APEX & EXTRA NITRO',
    description: 'Forgiving AI opponents with reduced top speed and +25% nitro boost regeneration. Perfect for learning track layouts.',
    aiAggression: 'RELAXED (60%)',
    nitroBonus: '+25% REGEN',
    color: 0x10b981, // Emerald Green
  },
  MEDIUM: {
    id: 'MEDIUM',
    name: 'GRID COMPETITOR',
    tagline: 'BALANCED PHYSICS & SMART AI',
    description: 'Standard competitive racing dynamics with balanced slipstreaming, adaptive AI pack driving, and standard nitro.',
    aiAggression: 'BALANCED (85%)',
    nitroBonus: 'STANDARD (1.0x)',
    color: 0xff5500, // Neon Orange
  },
  HARD: {
    id: 'HARD',
    name: 'APEX MASTER',
    tagline: 'UNFORGIVING CORNERS & PRO DRIVERS',
    description: 'Aggressive veteran AI with optimal racing lines, reduced drift margin, and punishment for wall collisions.',
    aiAggression: 'AGGRESSIVE (100%)',
    nitroBonus: 'CHALLENGE (0.8x)',
    color: 0xef4444, // Crimson Red
  },
};

export interface SelectionStateData {
  selectedTrackId: string;
  selectedCarId: string;
  selectedDifficulty: DifficultyId;
  returnScene?: string;
}

class SelectionStateManager {
  private state: SelectionStateData = {
    selectedTrackId: 'coastal-rush',
    selectedCarId: 'bolt-gt',
    selectedDifficulty: 'MEDIUM',
    returnScene: 'MainMenuScene',
  };

  public getState(): Readonly<SelectionStateData> {
    return { ...this.state };
  }

  public setTrack(trackId: string): void {
    this.state.selectedTrackId = trackId;
  }

  public setCar(carId: string): void {
    this.state.selectedCarId = carId;
  }

  public setDifficulty(difficulty: DifficultyId): void {
    this.state.selectedDifficulty = difficulty;
  }

  public setReturnScene(sceneKey: string): void {
    this.state.returnScene = sceneKey;
  }

  public updateState(partial: Partial<SelectionStateData>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
  }

  public reset(): void {
    this.state = {
      selectedTrackId: 'coastal-rush',
      selectedCarId: 'bolt-gt',
      selectedDifficulty: 'MEDIUM',
      returnScene: 'MainMenuScene',
    };
  }
}

export const selectionState = new SelectionStateManager();

