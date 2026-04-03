import { assertGameRenderer } from './renderer-contract.js';
import { createPhaserRendererAdapter } from './phaser-renderer-adapter.js';
import { getViewportMetrics } from '../phaser/bridge.js';

const DEFAULT_RENDERER = 'phaser';

function readRequestedRenderer() {
  try {
    localStorage.setItem('rendererBackend', DEFAULT_RENDERER);
  } catch (_error) {
    // noop
  }

  return DEFAULT_RENDERER;
}

async function createGameRenderer(initialSnapshot) {
  const renderer = assertGameRenderer(createPhaserRendererAdapter());
  await renderer.init(initialSnapshot);
  return renderer;
}

function getCanvasSize() {
  return getViewportMetrics();
}

export { createGameRenderer, getCanvasSize, readRequestedRenderer };
