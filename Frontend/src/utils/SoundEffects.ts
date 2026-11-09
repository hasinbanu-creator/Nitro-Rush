import { settingsManager } from './SettingsManager';

/**
 * SoundEffects: Zero-dependency procedural Web Audio synthesizer
 * Provides futuristic cyber racing UI sound effects without external audio files.
 */
class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public enabled: boolean = true;

  constructor() {
    settingsManager.addListener(() => {
      this.syncMasterVolume();
    });
  }

  private getContext(): AudioContext | null {
    const settings = settingsManager.getSettings();
    if (!this.enabled || !settings.soundEnabled) return null;

    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.syncMasterVolume();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public syncMasterVolume(): void {
    if (!this.ctx) return;
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    const settings = settingsManager.getSettings();
    const targetVolume = (this.enabled && settings.soundEnabled) ? settings.masterVolume : 0;
    this.masterGain.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
  }

  public getMasterVolume(): number {
    return settingsManager.getMasterVolume();
  }

  public isSoundEnabled(): boolean {
    return this.enabled && settingsManager.isSoundEnabled();
  }

  private connectOutput(node: AudioNode, ctx: AudioContext): void {
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);
      this.syncMasterVolume();
    }
    node.connect(this.masterGain);
  }

  /**
   * Unlock audio context on initial user interaction
   */
  public unlock(): void {
    this.getContext();
  }

  /**
   * Short futuristic blip on button hover
   */
  public playHover(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(960, now + 0.05);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      this.connectOutput(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Crisp cyber click on button press
   */
  public playClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      this.connectOutput(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Nitro blast / game start ignition sound
   */
  public playNitroLaunch(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Low frequency rumble/sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      // Filter for warm bass
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(1200, now + 0.2);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      this.connectOutput(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Crisp futuristic ascending chime when a mini-turbo boost is earned from a drift
   */
  public playMiniTurbo(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [580, 880, 1175].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.06, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.14);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.14);
      });
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Sci-fi chime when modal opens
   */
  public playModalOpen(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [587.33, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.05, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.12);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.12);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Sci-fi descending tone when modal closes
   */
  public playModalClose(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [880, 587.33].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.04, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.1);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.1);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Countdown beep for 3, 2, 1 and high pitch for GO!
   */
  public playCountdownBeep(isGo: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (isGo) {
        // High energetic tone for GO!
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // Standard beep for 3, 2, 1
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Subtle futuristic blip when a checkpoint gate is cleared
   */
  public playCheckpoint(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08); // E6

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      this.connectOutput(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Energetic ascending arpeggio when completing a lap
   */
  public playLapComplete(isBest: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = isBest ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99]; // C Major
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.08, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.2);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.2);
      });
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Dramatic warning tone for final lap announcement
   */
  public playFinalLap(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Dual-tone siren flare
      [440, 554.37, 659.25].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.35);

        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, now);

        osc.connect(filter);
        filter.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now);
        osc.stop(now + 0.45);
      });
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Triumphant victory fanfare when completing race
   */
  public playFinishRace(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Fanfare chord progression: G4 -> C5 -> E5 -> G5
      const notes = [392.00, 523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0.1, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.4);

        osc.connect(gain);
        this.connectOutput(gain, ctx);

        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.4);
      });
    } catch {
      // Audio context might be restricted
    }
  }

  /**
   * Tire screech sound during aggressive drifting

   */
  public playDriftScreech(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.linearRampToValueAtTime(360, now + 0.08);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);

      osc.connect(filter);
      filter.connect(gain);
      this.connectOutput(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore
    }
  }

  /**
   * Impact thud / crunch when two racing vehicles collide
   */
  public playCarBump(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);

      osc.connect(filter);
      filter.connect(gain);
      this.connectOutput(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore
    }
  }
}

export const SoundEffects = new SoundEffectsManager();
export { settingsManager } from './SettingsManager';

