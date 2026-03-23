import { CONFIG } from './config.js';
import { isAuthenticated, saveResultToLeaderboard, loadAndDisplayLeaderboard } from './api.js';
import { audioManager, toggleSfxMute, toggleMusicMute, syncAllAudioUI } from './audio.js';
import { DOM, gameState, curves, player, obstacles, bonuses, coins, spinTargets, ctx, inputQueue, getBestScore, getBestDistance, setBestScore, setBestDistance } from './state.js';
import { resetGameSessionState, update } from './physics.js';
import { resizeCanvas, drawTube, drawTubeDepth, drawTubeCenter, drawTubeBezel, drawSpeedLines, drawNeonLines, drawObjects, drawCoins, drawPlayer, drawRadarHints, drawSpinAlert, drawBonusText, canvasW, canvasH } from './renderer.js';
import { particlePool, updateParticles, drawParticles } from './particles.js';
import { assetManager } from './assets.js';
import { showBonusText, showStore, hideStore, updateUI, updateGameOverLeaderboardNotice } from './ui.js';
import { hasWalletAuthSession } from './auth.js';
import { loadPlayerRides, useRide, updateRidesDisplay, showRules, hideRules, hasRideLimit, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './store.js';
import { playerRides } from './store/rides-service.js';
import { playerEffects, playerUpgrades, getShieldUpgradeSnapshot } from './store/upgrades-service.js';
import { perfMonitor } from './perf.js';
import { showMainMenuScreen, showGameplayScreen, showGameOverScreen } from './screens.js';
import { initGameBootstrapFlow } from './game/bootstrap.js';
import { createGameLoopController } from './game/loop.js';
import { createGameSessionController } from './game/session.js';
import { logger } from './logger.js';

/* ===== GAME FUNCTIONS ===== */
const sessionController = createGameSessionController({
  CONFIG,
  DOM,
  gameState,
  curves,
  player,
  obstacles,
  bonuses,
  coins,
  spinTargets,
  inputQueue,
  particlePool,
  playerRides,
  playerEffects,
  playerUpgrades,
  getShieldUpgradeSnapshot,
  resetGameSessionState,
  resizeCanvas,
  showBonusText,
  updateGameOverLeaderboardNotice,
  updateRidesDisplay,
  loadPlayerRides,
  useRide,
  hasRideLimit,
  isEligibleForLeaderboardFlow,
  isUnauthRuntimeMode,
  isAuthenticated,
  saveResultToLeaderboard,
  loadAndDisplayLeaderboard,
  showMainMenuScreen,
  showGameplayScreen,
  showGameOverScreen,
  hasWalletAuthSession,
  audioManager,
  syncAllAudioUI,
  assetManager,
  getCanvasDimensions,
  getBestScore,
  getBestDistance,
  setBestScore,
  setBestDistance,
  getLoopController: () => loopController,
  logger
});

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
    bgGrad.addColorStop(0, "#0a0a15");
    bgGrad.addColorStop(1, "#15080f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = "#c084fc";
    ctx.font = "bold 28px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Ursas Tube", canvasW / 2, canvasH * 0.38);

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Orbitron, Arial";
    ctx.textBaseline = "middle";
    ctx.fillText("⏳ Loading...", canvasW / 2, canvasH * 0.5);

    const barWidth = canvasW * 0.35;
    const barHeight = 25;
    const barX = canvasW / 2 - barWidth / 2;
    const barY = canvasH * 0.55;

    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 3;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "#c084fc";
    ctx.fillRect(barX + 3, barY + 3, (barWidth - 6) * (progress / 100), barHeight - 6);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.floor(progress)}%`, canvasW / 2, barY + barHeight / 2);
  },
  renderFrame: () => {
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
    drawBonusText();
    updateUI();
  },
  onUpdateError: (error) => {
    sessionController.endGame('Error: ' + error.message);
  },
  logger
});

/* ===== INITIALIZATION ===== */

async function initGame() {
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

export { endGame, initGame };
