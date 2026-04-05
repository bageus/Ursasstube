import { logger } from './logger.js';
import { initializePerfStabilizationLifecycle } from './perf-stabilization.js';

const VIEWPORT_SYNC_EVENT = 'ursas:viewport-sync-requested';
const PERF_SAMPLE_EVENT = 'ursas:perf-sample';

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
    if (!document.hidden) {
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
  tg.setHeaderColor('#05030b');
  tg.setBackgroundColor('#05030b');
  tg.ready();
  tg.isClosingConfirmationEnabled = true;

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

function initializeCoreLifecycle() {
  ensureResizeSubscription();
  ensureVisibilityResizeSubscription();
  initializePerfStabilizationLifecycle();
}

export {
  PERF_SAMPLE_EVENT,
  VIEWPORT_SYNC_EVENT,
  initializeCoreLifecycle,
  initializeTelegramViewportLifecycle,
  initializeMetaMaskLifecycle,
  initializePingLifecycle
};
