import { toggleSfxMute, toggleMusicMute } from './audio.js';
import { DOM, gameState, player, getBestScore, getBestDistance, setBestScore, setBestDistance, initializeGameplayRun, applyGameplayUpgradeState, clearGameplayCollections } from './state.js';
import { resetGameSessionState, update } from './physics.js';
import { createRenderSnapshot } from './render-snapshot.js';
import { createGameRenderer, getCanvasSize } from './renderers/index.js';
import { particlePool, updateParticles, drawParticles } from './particles.js';
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
const PHASER_LOADING_OVERLAY_ID = 'phaserLoadingOverlay';

function createSnapshotForRenderer(width, height) {
  return createRenderSnapshot({
    width,
    height,
    backend: 'phaser'
  });
}

function getCanvasDimensions() {
  const metrics = getCanvasSize();
  return { width: metrics.width, height: metrics.height };
}

function syncRendererViewport() {
  if (!activeRenderer) return;
  const { width, height } = getCanvasDimensions();
  activeRenderer.resize(createSnapshotForRenderer(width, height));
}

function bindViewportSyncLifecycle() {
  if (viewportSyncBound) return;
  window.addEventListener(VIEWPORT_SYNC_EVENT, syncRendererViewport);
  viewportSyncBound = true;
}

function requestViewportSync() {
  window.dispatchEvent(new CustomEvent(VIEWPORT_SYNC_EVENT));
}

function ensureLoadingOverlay() {
  let overlay = document.getElementById(PHASER_LOADING_OVERLAY_ID);
  if (overlay) return overlay;

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
  DOM.gameContent?.appendChild(overlay);
  return overlay;
}

function renderLoadingOverlay(progressValue) {
  const overlay = ensureLoadingOverlay();
  const progress = Math.max(0, Math.min(100, Math.floor(progressValue || 0)));
  overlay.innerHTML = `
    <div style="font-size: 28px; font-weight: 700; color: #c084fc;">Ursas Tube</div>
    <div style="font-size: 16px;">⏳ Loading...</div>
    <div style="width: 35%; min-width: 180px; border: 2px solid #c084fc; padding: 3px; box-sizing: border-box;">
      <div style="height: 18px; width: ${progress}%; background: #c084fc;"></div>
    </div>
    <div style="font-size: 14px; font-weight: 700;">${progress}%</div>
  `;
}

function hideLoadingOverlay() {
  document.getElementById(PHASER_LOADING_OVERLAY_ID)?.remove();
}

const loopController = createGameLoopController({
  gameState,
  assetManager,
  perfMonitor,
  syncViewport: requestViewportSync,
  getCanvasDimensions,
  renderLoadingFrame: () => {
    const progress = assetManager.getProgress();
    renderLoadingOverlay(progress);
  },
  renderFrame: () => {
    const { width, height } = getCanvasDimensions();
    activeRenderer?.render(createSnapshotForRenderer(width, height));
    drawParticles();
  },
  updateFrame: (delta) => {
    update(delta);
    updateParticles();
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
  particlePool,
  assetManager,
  getPlayerRides,
  getGameplayUpgradeSnapshot,
  getCanvasDimensions,
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
  initializeGameplayRun,
  applyGameplayUpgradeState,
  clearGameplayCollections
});

async function initGame() {
  const { width, height } = getCanvasDimensions();
  const initialSnapshot = createSnapshotForRenderer(width, height);
  activeRenderer = await createGameRenderer(initialSnapshot);
  bindViewportSyncLifecycle();
  syncRendererViewport();

  await initGameBootstrapFlow({
    startGame: sessionController.startGame,
    restartFromGameOver: sessionController.restartFromGameOver,
    goToMainMenu: sessionController.goToMainMenu,
    startMainLoop: loopController.startMainLoop,
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
