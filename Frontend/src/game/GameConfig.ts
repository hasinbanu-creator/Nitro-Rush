import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MainMenuScene } from '../scenes/MainMenuScene';
import { TrackSelectScene } from '../scenes/TrackSelectScene';
import { GarageScene } from '../scenes/GarageScene';
import { RaceScene } from '../scenes/RaceScene';
import { ResultsScene } from '../scenes/ResultsScene';
import { MultiplayerLobbyScene } from '../scenes/MultiplayerLobbyScene';
import { MultiplayerRaceScene } from '../scenes/MultiplayerRaceScene';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#070913',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MainMenuScene, TrackSelectScene, GarageScene, RaceScene, ResultsScene, MultiplayerLobbyScene, MultiplayerRaceScene],
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
  },
};
