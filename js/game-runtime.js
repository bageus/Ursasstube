import { initStoreBootstrap } from './features/store/index.js';
import { initInputHandlers } from './input.js';
import { initGame } from './game.js';
import { initializeCoreLifecycle } from './core/runtime.js';
import { logger } from './logger.js';
import { isTelegramRuntime, isMobileWebRuntime, isMobileLightRuntime } from './config.js';
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
  setupPostHogBridge();
  setupTelegramAnalyticsBridge();
}


function applyRuntimeClasses() {
  if (typeof document === 'undefined') return;

  document.documentElement?.classList.toggle('mobile-runtime', isMobileWebRuntime);
  document.documentElement?.classList.toggle('mobile-light-runtime', isMobileLightRuntime);
  document.documentElement?.classList.toggle('telegram-runtime', isTelegramRuntime);

  const applyToBody = () => {
    document.body?.classList.toggle('mobile-runtime', isMobileWebRuntime);
    document.body?.classList.toggle('mobile-light-runtime', isMobileLightRuntime);
    document.body?.classList.toggle('telegram-runtime', isTelegramRuntime);
  };

  if (document.body) {
    applyToBody();
    return;
  }

  document.addEventListener('DOMContentLoaded', applyToBody, { once: true });
}

let gameBootstrapInitialized = false;

function initGameBootstrap() {
  if (gameBootstrapInitialized) return;

  applyRuntimeClasses();
  initializeRuntimeDependencies();

  onDomReady(() => {
    logger.info('📄 DOM loaded');
    initGame();
  });

  gameBootstrapInitialized = true;
}

export { initGameBootstrap };
