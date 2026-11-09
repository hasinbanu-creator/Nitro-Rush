import Phaser from 'phaser';
import { TRACKS, type TrackConfig } from '../data/TrackData';
import { CircuitTrack } from './CircuitTrack';

export class TrackFactory {
  /**
   * Retrieves TrackConfig by id or returns default Coastal Rush
   */
  public static getTrackConfig(trackId: string): TrackConfig {
    return TRACKS.find((t) => t.id === trackId) || TRACKS[0];
  }

  /**
   * Instantiates and returns a CircuitTrack for the given track id or configuration
   */
  public static createTrack(scene: Phaser.Scene, trackIdOrConfig?: string | TrackConfig): CircuitTrack {
    let config: TrackConfig;
    if (typeof trackIdOrConfig === 'string') {
      config = TrackFactory.getTrackConfig(trackIdOrConfig);
    } else if (trackIdOrConfig) {
      config = trackIdOrConfig;
    } else {
      config = TRACKS[0];
    }

    return new CircuitTrack(scene, config);
  }
}

