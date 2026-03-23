import { resizeCanvas } from './renderer.js';
import { initStoreBootstrap } from './store.js';
import { initInputHandlers } from './input.js';
import { initGame } from './game.js';

function onDomReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

function subscribeWindowResize() {
  window.addEventListener('resize', () => {
    resizeCanvas();
  });
}

function initializeRuntimeDependencies() {
  initStoreBootstrap();
  initInputHandlers();
}

let gameBootstrapInitialized = false;

function initGameBootstrap() {
  if (gameBootstrapInitialized) return;

  initializeRuntimeDependencies();

  onDomReady(() => {
    console.log('📄 DOM loaded');
    resizeCanvas();
    initGame();
  });

  subscribeWindowResize();

  gameBootstrapInitialized = true;
}

export { initGameBootstrap };
