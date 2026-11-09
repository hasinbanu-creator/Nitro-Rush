/**
 * SettingsManager: Centralized settings persistence using localStorage with safe defaults
 */

export interface GameSettings {
  soundEnabled: boolean;
  masterVolume: number; // 0.0 to 1.0
  screenShakeEnabled: boolean;
  speedStreaksEnabled: boolean;
  minimapEnabled: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  masterVolume: 0.8,
  screenShakeEnabled: true,
  speedStreaksEnabled: true,
  minimapEnabled: true,
};

export const SETTINGS_KEY = 'nitro_rush_settings';

class SettingsManager {
  private settings: GameSettings;
  private listeners: ((settings: GameSettings) => void)[] = [];

  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * Safe load with JSON validation and fallback to defaults
   */
  public loadSettings(): GameSettings {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      const parsed = JSON.parse(raw);
      return {
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
        masterVolume: typeof parsed.masterVolume === 'number' && parsed.masterVolume >= 0 && parsed.masterVolume <= 1
          ? parsed.masterVolume
          : DEFAULT_SETTINGS.masterVolume,
        screenShakeEnabled: typeof parsed.screenShakeEnabled === 'boolean' ? parsed.screenShakeEnabled : DEFAULT_SETTINGS.screenShakeEnabled,
        speedStreaksEnabled: typeof parsed.speedStreaksEnabled === 'boolean' ? parsed.speedStreaksEnabled : DEFAULT_SETTINGS.speedStreaksEnabled,
        minimapEnabled: typeof parsed.minimapEnabled === 'boolean' ? parsed.minimapEnabled : DEFAULT_SETTINGS.minimapEnabled,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Persists settings to localStorage safely
   */
  public saveSettings(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage quota or private browsing restriction
    }
  }

  public getSettings(): Readonly<GameSettings> {
    return { ...this.settings };
  }

  public getMasterVolume(): number {
    return this.settings.masterVolume;
  }

  public isSoundEnabled(): boolean {
    return this.settings.soundEnabled;
  }

  public updateSettings(partial: Partial<GameSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
    };
    this.saveSettings();
    this.notifyListeners();
  }

  public setSoundEnabled(enabled: boolean): void {
    this.updateSettings({ soundEnabled: enabled });
  }

  public setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1.0, volume));
    this.updateSettings({ masterVolume: clamped });
  }

  public setScreenShake(enabled: boolean): void {
    this.updateSettings({ screenShakeEnabled: enabled });
  }

  public setSpeedStreaks(enabled: boolean): void {
    this.updateSettings({ speedStreaksEnabled: enabled });
  }

  public setMinimapEnabled(enabled: boolean): void {
    this.updateSettings({ minimapEnabled: enabled });
  }

  public resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
    this.notifyListeners();
  }

  public addListener(listener: (settings: GameSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l(this.getSettings()));
  }
}

export const settingsManager = new SettingsManager();
