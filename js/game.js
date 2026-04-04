import { toggleSfxMute, toggleMusicMute } from './audio.js';
import { DOM, gameState, player, ctx, getBestScore, getBestDistance, setBestScore, setBestDistance, initializeGameplayRun, applyGameplayUpgradeState, clearGameplayCollections } from './state.js';
import { resetGameSessionState, update } from './physics.js';
import { resizeCanvas, drawTube, drawTubeDepth, drawTubeCenter, drawTubeBezel, drawNeonLines, drawObjects, drawCoins, drawPlayer, drawRadarHints, drawSpinAlert, drawBonusText, canvasW, canvasH } from './renderer.js';
import { createRenderSnapshot } from './render-snapshot.js';
import { createGameRenderer, getCanvasSize, readRequestedRenderer } from './renderers/index.js';
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
import { hasWalletAuthSession } from './auth.js';
import { logger } from './logger.js';

const requestedRenderer = readRequestedRenderer();
const usePhaserRenderer = requestedRenderer === 'phaser';
let activeRenderer = null;

function createSnapshotForRenderer(width, height) {
  return createRenderSnapshot({
    width,
    height,
    backend: usePhaserRenderer ? 'phaser' : 'canvas'
  });
}

function getCanvasDimensions() {
  if (usePhaserRenderer) {
    const metrics = getCanvasSize();
    return { width: metrics.width, height: metrics.height };
  }

  const fallbackW = DOM.canvas?.clientWidth || window.innerWidth || 360;
  const fallbackH = DOM.canvas?.clientHeight || window.innerHeight || 640;
  const width = Number.isFinite(canvasW) && canvasW > 0 ? canvasW : fallbackW;
  const height = Number.isFinite(canvasH) && canvasH > 0 ? canvasH : fallbackH;
  return { width, height };
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
    if (usePhaserRenderer) {
      const { width, height } = getCanvasDimensions();
      activeRenderer?.render(createSnapshotForRenderer(width, height));
      return;
    }

    drawTube();
    drawTubeDepth();
    drawTubeCenter();
    drawTubeBezel();
    drawNeonLines();
    drawObjects();
    drawCoins();
    drawPlayer();
    drawParticles();
    drawRadarHints();
    drawSpinAlert();
  },
  updateFrame: (delta) => {
    update(delta);
    updateParticles();
  },
  renderUiFrame: () => {
    if (!usePhaserRenderer) {
      drawBonusText();
    }
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
  if (usePhaserRenderer) {
    const { width, height } = getCanvasDimensions();
    const initialSnapshot = createSnapshotForRenderer(width, height);
    activeRenderer = await createGameRenderer(initialSnapshot);
    activeRenderer?.resize(initialSnapshot);
  }

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
    toggleMusicMute
  });
}

const { endGame } = sessionController;

export { initGame, endGame };
