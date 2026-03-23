import { assertGameRenderer } from './renderer-contract.js';
import { createCanvasRendererAdapter, getCanvasSize } from './canvas-renderer-adapter.js';
import { createPhaserRendererAdapter } from './phaser-renderer-adapter.js';

const DEFAULT_RENDERER = 'canvas';
const VALID_RENDERERS = new Set(['canvas', 'phaser']);

function readRequestedRenderer() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryRenderer = params.get('renderer');
    if (VALID_RENDERERS.has(queryRenderer)) {
      localStorage.setItem('rendererBackend', queryRenderer);
      return queryRenderer;
    }

    const storedRenderer = localStorage.getItem('rendererBackend');
    if (VALID_RENDERERS.has(storedRenderer)) {
      return storedRenderer;
    }
  } catch (_error) {
    return DEFAULT_RENDERER;
  }

  return DEFAULT_RENDERER;
}

function createRendererAdapter(name) {
  if (name === 'phaser') {
    return createPhaserRendererAdapter();
  }

  return createCanvasRendererAdapter();
}

async function createGameRenderer(initialSnapshot) {
  const requestedRenderer = readRequestedRenderer();
  let renderer = createRendererAdapter(requestedRenderer);

  try {
    renderer = assertGameRenderer(renderer);
    const initialized = await renderer.init(initialSnapshot);
    if (!initialized) {
      throw new Error(`${requestedRenderer} renderer is not ready`);
    }
    return renderer;
  } catch (error) {
    console.warn(`⚠️ Falling back to canvas renderer from \"${requestedRenderer}\".`, error);
    if (renderer.name !== 'canvas') {
      renderer.destroy();
      renderer = assertGameRenderer(createCanvasRendererAdapter());
      await renderer.init(initialSnapshot);
    }
    return renderer;
  }
}

export { createGameRenderer, getCanvasSize, readRequestedRenderer };
