import { CONFIG } from '../config.js';
import { DOM, ctx, gameState } from '../state.js';
import { advanceTubeState, createTubeModelSnapshot } from './geometry.js';
import { CanvasTubeBackend } from './backends/canvas.js';
import { WebGLTubeBackend } from './backends/webgl.js';

const TUBE_RENDERER_MODES = {
  canvas: 'canvas',
  webgl: 'webgl'
};

function getConfiguredTubeRendererMode() {
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get('tubeRenderer');
  const storedMode = window.localStorage.getItem('tubeRendererMode');
  const requestedMode = (queryMode || storedMode || CONFIG.TUBE_RENDERER_MODE || 'canvas').toLowerCase();
  return requestedMode === TUBE_RENDERER_MODES.webgl ? TUBE_RENDERER_MODES.webgl : TUBE_RENDERER_MODES.canvas;
}

class TubeRendererController {
  constructor() {
    this.mode = getConfiguredTubeRendererMode();
    this.backends = {
      canvas: new CanvasTubeBackend(ctx),
      webgl: new WebGLTubeBackend(DOM.canvas, ctx)
    };
    this.activeBackend = this.backends.canvas;
    this.lastResolvedMode = 'canvas';
    this.currentViewport = { width: 0, height: 0, dpr: 1 };
    this.resolveBackend();
  }

  setViewport(viewport) {
    this.currentViewport = viewport;
    this.backends.canvas.resize(viewport);
    this.backends.webgl.resize(viewport);
  }

  setMode(mode) {
    this.mode = mode === TUBE_RENDERER_MODES.webgl ? TUBE_RENDERER_MODES.webgl : TUBE_RENDERER_MODES.canvas;
    window.localStorage.setItem('tubeRendererMode', this.mode);
    this.resolveBackend();
  }

  resolveBackend() {
    if (this.mode === TUBE_RENDERER_MODES.webgl && this.backends.webgl.isSupported()) {
      this.activeBackend = this.backends.webgl;
      this.lastResolvedMode = 'webgl';
    } else {
      this.activeBackend = this.backends.canvas;
      this.lastResolvedMode = 'canvas';
    }
    gameState.debugStats.tubeRendererMode = this.lastResolvedMode;
  }

  draw(viewport) {
    const start = performance.now();
    this.setViewport(viewport);
    this.resolveBackend();
    advanceTubeState(gameState);
    const model = createTubeModelSnapshot(gameState, viewport, {
      requestedMode: this.mode,
      resolvedMode: this.lastResolvedMode
    });
    const rendered = this.activeBackend.draw(model);
    if (!rendered && this.activeBackend !== this.backends.canvas) {
      this.activeBackend = this.backends.canvas;
      this.lastResolvedMode = 'canvas';
      this.activeBackend.draw(model);
    }

    gameState.debugStats.tubeQuads = model.quadCount;
    gameState.debugStats.estimatedTubePasses = model.estimatedTubePasses;
    gameState.debugStats.tubeMs = performance.now() - start;
    gameState.debugStats.tubeRendererMode = this.lastResolvedMode;
  }
}

const tubeRendererController = new TubeRendererController();

export {
  TUBE_RENDERER_MODES,
  getConfiguredTubeRendererMode,
  tubeRendererController
};
