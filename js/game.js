import { toggleSfxMute, toggleMusicMute } from './audio.js';
import { DOM, gameState, player, ctx, getBestScore, getBestDistance, setBestScore, setBestDistance, initializeGameplayRun, applyGameplayUpgradeState, clearGameplayCollections } from './state.js';
import { resetGameSessionState, update } from './physics.js';
import { resizeCanvas } from './renderer.js';
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

const loopController = createGameLoopController({
  DOM,
  ctx,
  gameState,
  assetManager,
  perfMonitor,
  resizeCanvas,
  getCanvasDimensions,
  renderLoadingFrame: ({ canvasW, canvasH }) => {
    const progress = assetManager.getProgress();
    ctx.clearRect(0, 0, canvasW, canvasH);

    const bgGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    bgGrad.addColorStop(0, '#0a0a15');
    bgGrad.addColorStop(1, '#15080f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 28px Orbitron, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Ursas Tube', canvasW / 2, canvasH * 0.38);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Orbitron, Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏳ Loading...', canvasW / 2, canvasH * 0.5);

    const barWidth = canvasW * 0.35;
    const barHeight = 25;
    const barX = canvasW / 2 - barWidth / 2;
    const barY = canvasH * 0.55;

    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 3;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = '#c084fc';
    ctx.fillRect(barX + 3, barY + 3, (barWidth - 6) * (progress / 100), barHeight - 6);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Orbitron, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.floor(progress)}%`, canvasW / 2, barY + barHeight / 2);
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
    updateUI();
  },
  shouldRenderCanvasLayer: () => false,
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
  resizeCanvas,
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
