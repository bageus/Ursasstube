import { initStoreBootstrap } from './features/store/index.js';
import { initInputHandlers } from './input.js';
import { initGame } from './game.js';
import { initializeCoreLifecycle } from './core/runtime.js';
import { logger } from './logger.js';
import { setupAnalyticsDelivery } from './analytics-delivery.js';
import { setupPostHogBridge } from './posthog-bridge.js';
import { setupTelegramAnalyticsBridge } from './telegram-analytics.js';

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
  setupAnalyticsDelivery();
  setupPostHogBridge();
  setupTelegramAnalyticsBridge();
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
