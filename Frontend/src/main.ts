import './style.css';
import Phaser from 'phaser';
import { gameConfig } from './game/GameConfig';

// Initialize the Nitro Rush game instance
export const game = new Phaser.Game(gameConfig);

// Expose on window in dev for inspection/testing
if (import.meta.env.DEV) {
  (window as unknown as { __NITRO_GAME__: Phaser.Game }).__NITRO_GAME__ = game;
}
