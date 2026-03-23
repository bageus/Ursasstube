import { CONFIG } from '../config.js';
import { isAuthenticated, saveResultToLeaderboard, loadAndDisplayLeaderboard } from '../api.js';
import { audioManager, syncAllAudioUI } from '../audio.js';
import { showBonusText, updateGameOverLeaderboardNotice } from '../ui.js';
import { spawnParticles } from '../particles.js';
import { showMainMenuScreen, showGameplayScreen, showGameOverScreen } from '../screens.js';
import { logger } from '../logger.js';

const CRASH_FLYER_SRC = 'img/bear_pixel_transparent.webp';
const CRASH_FLYER_FALLBACK_SRC = 'img/bear.png';
const CRASH_FLY_DEFAULT_DURATION_MS = 6000;
const START_TRANSITION_STATIC_EYES_SRC = 'img/startgame/eyes_1.webp';
const MENU_EYES_STATIC_SRC = 'img/eyes.png';

function createGameSessionController({
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
  assetManager,
  playerRides,
  playerEffects,
  playerUpgrades,
  getShieldUpgradeSnapshot,
  getSpinCooldownReductionSeconds,
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
  getBestDistance
}) {
  function resetUiAfterRideFailure() {
    audioManager.stopSFX('gameover_screen');
    showMainMenuScreen();
    if (DOM.darkScreen) DOM.darkScreen.style.display = 'none';
    updateRidesDisplay();
  }

  function stopMenuLaunchAnimation() {
    document.body.classList.remove('start-launching');
    DOM.gameStart.classList.remove('start-launching');

    if (DOM.menuEyes) {
      DOM.menuEyes.src = MENU_EYES_STATIC_SRC;
    }
  }

  function playMenuLaunchAnimation() {
    stopMenuLaunchAnimation();
    document.body.classList.add('start-launching');
    DOM.gameStart.classList.add('start-launching');
  }

  function stopStartTransitionAnimation() {
    const darkScreen = DOM.darkScreen;
    if (!darkScreen) return;

    darkScreen.classList.remove('start-transition-active');

    if (DOM.startTransitionEyes) {
      DOM.startTransitionEyes.src = START_TRANSITION_STATIC_EYES_SRC;
    }
  }

  function stopGameOverCrashAnimation() {
    stopStartTransitionAnimation();

    const darkScreen = DOM.darkScreen;
    if (!darkScreen) return;
    darkScreen.classList.remove('gameover-transition');

    if (DOM.crashFlyer) {
      DOM.crashFlyer.classList.remove('active');
      DOM.crashFlyer.style.animation = 'none';
    }
  }

  function playGameOverCrashAnimation(durationMs = CRASH_FLY_DEFAULT_DURATION_MS) {
    const darkScreen = DOM.darkScreen;
    if (!darkScreen) return;

    darkScreen.classList.add('gameover-transition');

    let flyer = DOM.crashFlyer;
    if (!flyer) {
      flyer = document.createElement('img');
      flyer.id = 'crashFlyer';
      flyer.className = 'crash-flyer';
      flyer.width = 128;
      flyer.height = 128;
      flyer.alt = '';
      flyer.decoding = 'async';
      flyer.onerror = () => {
        if (!flyer.dataset.fallbackApplied) {
          flyer.dataset.fallbackApplied = '1';
          flyer.src = CRASH_FLYER_FALLBACK_SRC;
        }
      };
      darkScreen.appendChild(flyer);
      DOM.crashFlyer = flyer;
    }

    flyer.dataset.fallbackApplied = '';
    flyer.src = CRASH_FLYER_SRC;
    flyer.classList.remove('active');
    flyer.style.animation = 'none';
    void flyer.offsetWidth;
    const safeDuration = Math.max(1200, durationMs | 0);
    darkScreen.style.setProperty('--crash-fly-duration', `${safeDuration}ms`);

    flyer.style.animation = '';
    flyer.classList.add('active');
  }

  function areAllAssetsReady() {
    if (!assetManager.isReady()) return false;

    const criticalAssets = [
      'coins_gold', 'coins_silver',
      'obstacles_1', 'obstacles_2', 'obstacles_3',
      'bonus_shield', 'bonus_speed', 'bonus_magnet', 'bonus_chkey',
      'bonus_score_plus', 'bonus_score_minus', 'bonus_recharge',
      'character_back_idle', 'character_left_idle', 'character_right_idle',
      'character_left_swipe', 'character_right_swipe', 'character_spin'
    ];

    for (const name of criticalAssets) {
      if (!assetManager.getAsset(name)) return false;
    }
    return true;
  }

  function applyPlayerUpgrades() {
    if (playerEffects) {
      const shieldSnapshot = getShieldUpgradeSnapshot(playerEffects, playerUpgrades);

      if (shieldSnapshot.hasStartShield) {
        player.shieldCount = shieldSnapshot.startShieldCount;
        player.shield = player.shieldCount > 0;
        logger.info(`🛡 Start with ${player.shieldCount} shield(s), max ${shieldSnapshot.maxShieldCount}`);
      }
      gameState.spinCooldownReduction = getSpinCooldownReductionSeconds();
      gameState.invertScoreMultiplier = 1.0;
      const radarByEffect = Boolean(playerEffects.radar_active);
      const radarByUpgrade = Number(playerUpgrades?.radar?.currentLevel || 0) >= 1;
      gameState.radarActive = radarByEffect || radarByUpgrade;

      const rawSpinAlertEffect = String(playerEffects.spin_alert_level || '').trim().toLowerCase();
      let spinAlertByEffect = Number(playerEffects.spin_alert_level || 0);
      if (!Number.isFinite(spinAlertByEffect) || spinAlertByEffect <= 0) {
        if (['perfect', 'pro', 'perfect_alert', 'perfectalert', 'tier2', 'level2'].includes(rawSpinAlertEffect)) {
          spinAlertByEffect = 2;
        } else if (['alert', 'basic', 'tier1', 'level1', 'enabled', 'active', 'true'].includes(rawSpinAlertEffect)) {
          spinAlertByEffect = 1;
        } else {
          spinAlertByEffect = 0;
        }
      }
      const spinAlertByUpgrade = Number(playerUpgrades?.spin_alert?.currentLevel || 0);
      gameState.spinAlertLevel = Math.max(spinAlertByEffect, spinAlertByUpgrade);

      logger.info('✅ Upgrades applied:', {
        shieldCount: player.shieldCount,
        spinCooldownReduction: gameState.spinCooldownReduction,
        x2_duration_bonus: playerEffects.x2_duration_bonus || 0,
        magnet_duration_bonus: playerEffects.magnet_duration_bonus || 0,
        score_plus_300_multiplier: playerEffects.score_plus_300_multiplier || 1.0,
        score_plus_500_multiplier: playerEffects.score_plus_500_multiplier || 1.0,
        score_minus_300_multiplier: playerEffects.score_minus_300_multiplier || 1.0,
        score_minus_500_multiplier: playerEffects.score_minus_500_multiplier || 1.0,
        invert_score_multiplier: playerEffects.invert_score_multiplier || 1.0,
        speed_up_multiplier: playerEffects.speed_up_multiplier || 1.0,
        speed_down_multiplier: playerEffects.speed_down_multiplier || 1.0,
        radarActive: gameState.radarActive,
        spinAlertLevel: gameState.spinAlertLevel
      });
    } else {
      gameState.spinCooldownReduction = 0;
      gameState.invertScoreMultiplier = 1.0;
      gameState.radarActive = false;
      gameState.spinAlertLevel = 0;
      logger.info('⚪ No upgrades (wallet not connected or data not loaded)');
    }
  }

  function actualStartGame() {
    if (gameState.running) return;

    stopMenuLaunchAnimation();
    showGameplayScreen();

    loopController.runAfterLayoutStabilizes(() => {
      resizeCanvas();
      loopController.invalidateCachedBackgroundGradient();

      resetGameSessionState();
      showGameplayScreen();

      gameState.running = true;
      gameState.distance = 0;
      gameState.score = 0;
      gameState.speed = CONFIG.SPEED_START;
      gameState.baseMultiplier = 1;
      gameState.silverCoins = 0;
      gameState.goldCoins = 0;
      gameState.curveTimer = 0;
      gameState.lastTime = performance.now();

      gameState.lastObstacleDistance = 0;
      gameState.lastBonusDistance = 0;
      gameState.lastCoinSpawnDistance = 0;
      gameState.lastObstacleSpawnDistance = 0;

      curves.current.direction = 0;
      curves.current.strength = 0;
      curves.next.direction = Math.random() * Math.PI * 2;
      curves.next.strength = 0.5 + Math.random() * 0.5;

      player.lane = 0;
      player.targetLane = 0;
      player.shield = false;
      player.shieldCount = 0;

      obstacles.length = 0;
      bonuses.length = 0;
      coins.length = 0;
      spinTargets.length = 0;
      particlePool.clear();

      applyPlayerUpgrades();

      audioManager.playRandomGameMusic();
      loopController.scheduleResizeStabilization();
      logger.info('✅ Game started!');
    });
  }

  async function startGame() {
    if (!areAllAssetsReady()) {
      showBonusText('⏳ Loading sprites...');
      setTimeout(startGame, 500);
      return;
    }

    if (isAuthenticated() || hasRideLimit()) {
      await loadPlayerRides();

      if (hasRideLimit() && (playerRides.totalRides || 0) <= 0) {
        resetUiAfterRideFailure();
        alert(`🎟 No rides!\n⏰ Resets in ${playerRides.resetInFormatted}\n\n💰 Buy a ride pack in the Store!`);
        return;
      }

      const canPlay = await useRide();
      if (hasRideLimit() && !canPlay) {
        resetUiAfterRideFailure();
        alert(`🎟 No rides!\n⏰ ${playerRides.resetInFormatted}\n\n💰 Buy a pack in the Store!`);
        return;
      }
    }

    logger.info('▶️ Starting game...');
    audioManager.stopAll();

    showMainMenuScreen();
    playMenuLaunchAnimation();
    audioManager.playSFX('gamestart');

    const onEnd = () => {
      audioManager.sfx.gamestart.removeEventListener('ended', onEnd);
      stopMenuLaunchAnimation();
      actualStartGame();
    };
    audioManager.sfx.gamestart.addEventListener('ended', onEnd);

    setTimeout(() => {
      if (!gameState.running) {
        audioManager.sfx.gamestart.removeEventListener('ended', onEnd);
        stopMenuLaunchAnimation();
        actualStartGame();
      }
    }, 5000);
  }

  function restartFromGameOver() {
    audioManager.stopSFX('gameover_screen');
    startGame();
  }

  function endGame(reason = 'Unknown') {
    const { width: canvasW, height: canvasH } = getCanvasDimensions();
    resetGameSessionState();
    gameState.running = false;
    audioManager.stopMusic();

    spawnParticles(canvasW / 2, canvasH / 2, 'rgba(255, 0, 0, 1)', 30, 12);

    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }

    const reasonMap = {
      pit: 'Pit',
      spikes: 'Spikes',
      bottles: 'Bottles',
      wall_brick: 'Brick wall',
      wall_kactus: 'Cactus wall',
      tree: 'Tree',
      rock1: 'Rock',
      rock2: 'Rock',
      fence: 'Fence',
      bull: 'Bull',
      spawn_error: 'Generation error'
    };
    const prettyReason = reasonMap[reason] || reason;

    if (gameState.score > getBestScore()) {
      setBestScore(gameState.score);
    }
    if (gameState.distance > getBestDistance()) {
      setBestDistance(gameState.distance);
    }

    if (isEligibleForLeaderboardFlow()) {
      saveResultToLeaderboard();
    } else if (isUnauthRuntimeMode()) {
      logger.info('⚪ Unauth runtime mode — skipping leaderboard participant flow');
    }

    const duration = ((gameState.distance / gameState.speed / 50) / 60).toFixed(1);
    const darkScreen = DOM.darkScreen;
    darkScreen.style.display = 'block';
    const sfxDurationMs = Math.round((audioManager.sfx.gameover && Number.isFinite(audioManager.sfx.gameover.duration) ? audioManager.sfx.gameover.duration : 0) * 1000);
    const crashAnimDurationMs = sfxDurationMs > 0 ? sfxDurationMs : CRASH_FLY_DEFAULT_DURATION_MS;
    playGameOverCrashAnimation(crashAnimDurationMs);

    const showResult = () => {
      stopGameOverCrashAnimation();
      darkScreen.style.display = 'none';

      if (DOM.goReason) DOM.goReason.textContent = prettyReason;
      if (DOM.goDistance) DOM.goDistance.textContent = `${Math.floor(gameState.distance)} m`;
      if (DOM.goScore) DOM.goScore.textContent = Math.floor(gameState.score);
      if (DOM.goGold) DOM.goGold.textContent = gameState.goldCoins;
      if (DOM.goSilver) DOM.goSilver.textContent = gameState.silverCoins;
      if (DOM.goTime) DOM.goTime.textContent = `${duration}s`;

      updateGameOverLeaderboardNotice(
        isAuthenticated()
          ? ''
          : 'Authorize to become eligible for the leaderboard.'
      );
      loadAndDisplayLeaderboard();

      showGameOverScreen();
      syncAllAudioUI();
      audioManager.playSFX('gameover_screen');
    };

    audioManager.playSFX('gameover');

    const onEnd = () => {
      audioManager.sfx.gameover.removeEventListener('ended', onEnd);
      showResult();
    };
    audioManager.sfx.gameover.addEventListener('ended', onEnd);

    const resultFallbackMs = Math.max(CRASH_FLY_DEFAULT_DURATION_MS, crashAnimDurationMs);
    setTimeout(() => {
      audioManager.sfx.gameover.removeEventListener('ended', onEnd);
      if (!DOM.gameOver.classList.contains('visible')) showResult();
    }, resultFallbackMs);
  }

  function goToMainMenu() {
    logger.info('🏠 Return to main menu');
    audioManager.stopAll();
    stopMenuLaunchAnimation();

    showMainMenuScreen();
    gameState.running = false;

    obstacles.length = 0;
    bonuses.length = 0;
    coins.length = 0;
    spinTargets.length = 0;
    particlePool.clear();
    inputQueue.length = 0;

    player.lane = 0;
    player.targetLane = 0;
    player.shield = false;
    player.shieldCount = 0;
    player.magnetActive = false;
    player.invertActive = false;
    player.isSpin = false;
    gameState.spinActive = false;
    gameState.spinProgress = 0;
    gameState.spinCooldown = 0;

    resetGameSessionState();
    audioManager.playMusic('menu');

    if (hasWalletAuthSession() || isUnauthRuntimeMode()) {
      loadPlayerRides().then(() => updateRidesDisplay());
    }

    logger.info('✅ State reset');
  }

  return {
    endGame,
    goToMainMenu,
    restartFromGameOver,
    startGame
  };
}

export { createGameSessionController };
