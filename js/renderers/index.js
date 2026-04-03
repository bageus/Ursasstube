import { assertGameRenderer } from './renderer-contract.js';
import { createPhaserRendererAdapter } from './phaser-renderer-adapter.js';
import { getViewportMetrics } from '../phaser/bridge.js';

const DEFAULT_RENDERER = 'phaser';
const FALLBACK_RENDERER = 'canvas';

function readRequestedRenderer() {
  let preferred = DEFAULT_RENDERER;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('renderer');
    if (fromQuery === DEFAULT_RENDERER || fromQuery === FALLBACK_RENDERER) {
      preferred = fromQuery;
    } else {
      const fromStorage = localStorage.getItem('rendererBackend');
      if (fromStorage === DEFAULT_RENDERER || fromStorage === FALLBACK_RENDERER) {
        preferred = fromStorage;
      }
    }
  } catch (_error) {
    preferred = DEFAULT_RENDERER;
  }

  try {
    localStorage.setItem('rendererBackend', preferred);
  } catch (_error) {
    // noop
  }

  return preferred;
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
