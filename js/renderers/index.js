import { assertGameRenderer } from './renderer-contract.js';
import { createPhaserRendererAdapter } from './phaser-renderer-adapter.js';
import { getViewportMetrics } from '../phaser/bridge.js';

async function createGameRenderer(initialSnapshot) {
  const renderer = assertGameRenderer(createPhaserRendererAdapter());
  await renderer.init(initialSnapshot);
  return renderer;
}

function getViewportSize() {
  return getViewportMetrics();
}

export { createGameRenderer, getViewportSize };
