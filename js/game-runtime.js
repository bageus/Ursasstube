import { initStoreBootstrap } from './store.js';
import { initInputHandlers } from './input.js';
import { initGame } from './game.js';
import { initializeCoreLifecycle } from './runtime-lifecycle.js';
import { logger } from './logger.js';

function onDomReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

function initializeRuntimeDependencies() {
  initStoreBootstrap();
  initInputHandlers();
  initializeCoreLifecycle();
}

let gameBootstrapInitialized = false;

function initGameBootstrap() {
  if (gameBootstrapInitialized) return;

  initializeRuntimeDependencies();

  onDomReady(() => {
    logger.info('📄 DOM loaded');
    initGame();
  });

  gameBootstrapInitialized = true;
}

export { initGameBootstrap };
