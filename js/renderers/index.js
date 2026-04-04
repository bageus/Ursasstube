import { assertGameRenderer } from './renderer-contract.js';
import { createPhaserRendererAdapter } from './phaser-renderer-adapter.js';
import { getViewportMetrics } from '../phaser/bridge.js';

const DEFAULT_RENDERER = 'phaser';
const FALLBACK_RENDERER = 'canvas';
const EMERGENCY_FALLBACK_FLAG = '__URSAS_FORCE_CANVAS_FALLBACK__';

function readRequestedRenderer() {
  const fallbackEnabled = typeof window !== 'undefined' && window[EMERGENCY_FALLBACK_FLAG] === true;
  const preferred = fallbackEnabled ? FALLBACK_RENDERER : DEFAULT_RENDERER;

  if (fallbackEnabled) {
    try {
      window.dispatchEvent(new CustomEvent('ursas:renderer-fallback-activated', {
        detail: {
          renderer: FALLBACK_RENDERER,
          reason: 'emergency-flag'
        }
      }));
    } catch (_error) {
      // noop
    }
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
