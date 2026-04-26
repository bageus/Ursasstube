import { logger } from './logger.js';
import { initializePerfStabilizationLifecycle } from './perf-stabilization.js';
import { APP_VISIBILITY_EVENT, VIEWPORT_SYNC_EVENT } from './runtime-events.js';

function requestViewportSync() {
  window.dispatchEvent(new CustomEvent(VIEWPORT_SYNC_EVENT));
}

let resizeHandler = null;
let visibilityHandler = null;
let telegramViewportHandler = null;
let metamaskAccountsHandler = null;
let metamaskChainHandler = null;
let pingIntervalId = null;
let pingTimeoutId = null;

function ensureResizeSubscription() {
  if (resizeHandler) return resizeHandler;
  resizeHandler = () => {
    requestViewportSync();
  };
  window.addEventListener('resize', resizeHandler);
  return resizeHandler;
}

function ensureVisibilityResizeSubscription() {
  if (visibilityHandler) return visibilityHandler;
  visibilityHandler = () => {
    const hidden = document.hidden;
    window.dispatchEvent(new CustomEvent(APP_VISIBILITY_EVENT, {
      detail: { hidden }
    }));

    if (!hidden) {
      requestViewportSync();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  return visibilityHandler;
}

function initializeTelegramViewportLifecycle() {
  if (!(window.Telegram && window.Telegram.WebApp)) return () => {};

  const tg = window.Telegram.WebApp;
  tg.expand();
  const canSetColors = typeof tg.isVersionAtLeast === 'function'
    ? tg.isVersionAtLeast('6.1')
    : false;
  if (canSetColors) {
    tg.setHeaderColor('#05030b');
    tg.setBackgroundColor('#05030b');
  }
  tg.ready();
  if (typeof tg.enableClosingConfirmation === 'function') {
    tg.enableClosingConfirmation();
  }

  if (!telegramViewportHandler) {
    telegramViewportHandler = (event) => {
      if (event.isStateStable) {
        requestViewportSync();
      }
    };
    tg.onEvent('viewportChanged', telegramViewportHandler);
  }

  return () => {
    if (telegramViewportHandler && typeof tg.offEvent === 'function') {
      tg.offEvent('viewportChanged', telegramViewportHandler);
      telegramViewportHandler = null;
    }
  };
}

function initializeMetaMaskLifecycle({ onDisconnect, onReconnect, onChainChanged }) {
  if (!window.ethereum) return () => {};
  if (!metamaskAccountsHandler) {
    metamaskAccountsHandler = (accounts) => {
      logger.info('🔄 Account changed');
      if (accounts.length === 0) {
        onDisconnect();
      } else {
        onReconnect();
      }
    };
    window.ethereum.on('accountsChanged', metamaskAccountsHandler);
  }

  if (!metamaskChainHandler) {
    metamaskChainHandler = () => {
      logger.info('⛓️ Network changed — reloading');
      onChainChanged();
    };
    window.ethereum.on('chainChanged', metamaskChainHandler);
  }

  return () => {
    const ethereum = window.ethereum;
    const removeListener = ethereum?.removeListener?.bind(ethereum) || ethereum?.off?.bind(ethereum);
    if (!removeListener) return;
    if (metamaskAccountsHandler) {
      removeListener('accountsChanged', metamaskAccountsHandler);
      metamaskAccountsHandler = null;
    }
    if (metamaskChainHandler) {
      removeListener('chainChanged', metamaskChainHandler);
      metamaskChainHandler = null;
    }
  };
}

function initializePingLifecycle({ shouldMeasureInterval, shouldMeasureInitial, measurePing }) {
  cleanupPingLifecycle();
  pingIntervalId = window.setInterval(() => {
    if (shouldMeasureInterval()) measurePing();
  }, 5000);

  pingTimeoutId = window.setTimeout(() => {
    if (shouldMeasureInitial()) measurePing();
  }, 2000);

  return cleanupPingLifecycle;
}

function cleanupPingLifecycle() {
  if (pingIntervalId) {
    window.clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
  if (pingTimeoutId) {
    window.clearTimeout(pingTimeoutId);
    pingTimeoutId = null;
  }
}

function subscribeAppVisibilityLifecycle(callback, { emitInitial = true } = {}) {
  if (typeof callback !== 'function') return () => {};

  const handler = (event) => {
    callback(Boolean(event?.detail?.hidden));
  };

  window.addEventListener(APP_VISIBILITY_EVENT, handler);

  if (emitInitial) {
    callback(Boolean(document.hidden));
  }

  return () => {
    window.removeEventListener(APP_VISIBILITY_EVENT, handler);
  };
}

function initializeCoreLifecycle() {
  ensureResizeSubscription();
  ensureVisibilityResizeSubscription();
  initializePerfStabilizationLifecycle();
}

export {
  VIEWPORT_SYNC_EVENT,
  initializeCoreLifecycle,
  initializeTelegramViewportLifecycle,
  initializeMetaMaskLifecycle,
  initializePingLifecycle,
  subscribeAppVisibilityLifecycle
};

export { PERF_SAMPLE_EVENT } from './runtime-events.js';
