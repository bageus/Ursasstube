import { toggleSfxMute, toggleMusicMute } from './audio.js';
import { DOM, gameState, player, getBestScore, getBestDistance, setBestScore, setBestDistance, initializeGameplayRun, applyGameplayUpgradeState, clearGameplayCollections } from './state.js';
import { resetGameSessionState, update } from './physics.js';
import { createRenderSnapshot } from './render-snapshot.js';
import { createGameRenderer, getViewportSize } from './renderers/index.js';
import { assetManager } from './assets.js';
import { showStore, hideStore, updateUI } from './ui.js';
import { loadPlayerRides, useRide, updateRidesDisplay, showRules, hideRules, hasRideLimit, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './store.js';
import { getPlayerRides } from './store/rides-service.js';
import { getGameplayUpgradeSnapshot } from './store/upgrades-service.js';
import { perfMonitor } from './perf.js';
import { initGameBootstrapFlow } from './game/bootstrap.js';
import { createGameLoopController } from './game/loop.js';
import { createGameSessionController } from './game/session.js';
import { VIEWPORT_SYNC_EVENT } from './runtime-lifecycle.js';
import { hasWalletAuthSession } from './auth.js';
import { logger } from './logger.js';

let activeRenderer = null;
let viewportSyncBound = false;
let rendererInitPromise = null;
const PHASER_LOADING_OVERLAY_ID = 'phaserLoadingOverlay';
let loadingOverlayElements = null;

function createSnapshotForRenderer(width, height) {
  return createRenderSnapshot({
    width,
    height,
    backend: 'phaser'
  });
}

function getViewportDimensions() {
  const metrics = getViewportSize();
  return { width: metrics.width, height: metrics.height };
}

function syncRendererViewport() {
  if (!activeRenderer) return;
  const { width, height } = getViewportDimensions();
  activeRenderer.resize(createSnapshotForRenderer(width, height));
}

function bindViewportSyncLifecycle() {
  if (viewportSyncBound) return;
  window.addEventListener(VIEWPORT_SYNC_EVENT, syncRendererViewport);
  viewportSyncBound = true;
}

function isRendererReady() {
  return Boolean(activeRenderer);
}

async function ensureRendererReady({ forceRecreate = false } = {}) {
  if (forceRecreate && activeRenderer) {
    activeRenderer.destroy();
    activeRenderer = null;
  }

  if (activeRenderer) {
    return activeRenderer;
  }

  if (!rendererInitPromise) {
    rendererInitPromise = (async () => {
      const { width, height } = getViewportDimensions();
      const initialSnapshot = createSnapshotForRenderer(width, height);
      const renderer = await createGameRenderer(initialSnapshot);
      activeRenderer = renderer;
      bindViewportSyncLifecycle();
      syncRendererViewport();
      return renderer;
    })();
  }

  try {
    return await rendererInitPromise;
  } finally {
    rendererInitPromise = null;
  }
}

function destroyRenderer() {
  rendererInitPromise = null;
  activeRenderer?.destroy?.();
  activeRenderer = null;
}

function requestViewportSync() {
  window.dispatchEvent(new CustomEvent(VIEWPORT_SYNC_EVENT));
}

function ensureLoadingOverlay() {
  if (loadingOverlayElements?.overlay?.isConnected) {
    return loadingOverlayElements;
  }

  let overlay = document.getElementById(PHASER_LOADING_OVERLAY_ID);
  if (overlay) {
    const progressFill = overlay.querySelector('[data-role=\"progress-fill\"]');
    const progressValue = overlay.querySelector('[data-role=\"progress-value\"]');
    if (progressFill && progressValue) {
      loadingOverlayElements = { overlay, progressFill, progressValue };
      return loadingOverlayElements;
    }
    overlay.remove();
  }

  overlay = document.createElement('div');
  overlay.id = PHASER_LOADING_OVERLAY_ID;
  overlay.setAttribute('aria-live', 'polite');
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    background: 'linear-gradient(180deg, #0a0a15 0%, #15080f 100%)',
    color: '#ffffff',
    fontFamily: 'Orbitron, Arial, sans-serif',
    zIndex: '4'
  });
  const title = document.createElement('div');
  title.textContent = 'Ursas Tube';
  Object.assign(title.style, {
    fontSize: '28px',
    fontWeight: '700',
    color: '#c084fc'
  });

  const subtitle = document.createElement('div');
  subtitle.textContent = '⏳ Loading...';
  subtitle.style.fontSize = '16px';

  const progressWrap = document.createElement('div');
  Object.assign(progressWrap.style, {
    width: '35%',
    minWidth: '180px',
    border: '2px solid #c084fc',
    padding: '3px',
    boxSizing: 'border-box'
  });

  const progressFill = document.createElement('div');
  progressFill.dataset.role = 'progress-fill';
  Object.assign(progressFill.style, {
    height: '18px',
    width: '0%',
    background: '#c084fc'
  });
  progressWrap.appendChild(progressFill);

  const progressValue = document.createElement('div');
  progressValue.dataset.role = 'progress-value';
  Object.assign(progressValue.style, {
    fontSize: '14px',
    fontWeight: '700'
  });
  progressValue.textContent = '0%';

  overlay.append(title, subtitle, progressWrap, progressValue);
  DOM.gameContent?.appendChild(overlay);
  loadingOverlayElements = { overlay, progressFill, progressValue };
  return loadingOverlayElements;
}

function renderLoadingOverlay(progressValue) {
  const { progressFill, progressValue: progressLabel } = ensureLoadingOverlay();
  const progress = Math.max(0, Math.min(100, Math.floor(progressValue || 0)));
  progressFill.style.width = `${progress}%`;
  progressLabel.textContent = `${progress}%`;
}

function hideLoadingOverlay() {
  loadingOverlayElements?.overlay?.remove();
  loadingOverlayElements = null;
}

const loopController = createGameLoopController({
  gameState,
  assetManager,
  perfMonitor,
  syncViewport: requestViewportSync,
  renderLoadingFrame: () => {
    const progress = assetManager.getProgress();
    renderLoadingOverlay(progress);
  },
  renderFrame: () => {
    const { width, height } = getViewportDimensions();
    activeRenderer?.render(createSnapshotForRenderer(width, height));
  },
  updateFrame: (delta) => {
    update(delta);
  },
  renderUiFrame: () => {
    hideLoadingOverlay();
    updateUI();
  },
  onUpdateError: (error) => {
    sessionController.endGame(`Error: ${error.message}`);
  },
  logger
});

const sessionController = createGameSessionController({
  DOM,
  gameState,
  player,
  assetManager,
  getPlayerRides,
  getGameplayUpgradeSnapshot,
  getViewportDimensions,
  syncViewport: requestViewportSync,
  loopController,
  resetGameSessionState,
  loadPlayerRides,
  useRide,
  updateRidesDisplay,
  hasRideLimit,
  isEligibleForLeaderboardFlow,
  isUnauthRuntimeMode,
  hasWalletAuthSession,
  setBestScore,
  getBestScore,
  setBestDistance,
  getBestDistance,
  ensureRendererReady,
  destroyRenderer,
  initializeGameplayRun,
  applyGameplayUpgradeState,
  clearGameplayCollections
});

async function initGame() {
  await initGameBootstrapFlow({
    startGame: sessionController.startGame,
    restartFromGameOver: sessionController.restartFromGameOver,
    goToMainMenu: sessionController.goToMainMenu,
    showStore,
    hideStore,
    showRules,
    hideRules,
    toggleSfxMute,
    toggleMusicMute,
    prepareViewport: () => {}
  });
}

const { endGame } = sessionController;

export { initGame, endGame };
