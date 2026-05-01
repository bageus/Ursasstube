import { CONFIG } from '../config.js';
import { isAuthenticated, saveResultToLeaderboard, loadAndDisplayLeaderboard, fetchGameOverPreview } from '../api.js';
import { audioManager, syncAllAudioUI } from '../audio.js';
import { showBonusText, updateGameOverLeaderboardNotice, getLeaderboardSnapshot, setGameOverInsightsLoading, beginGameOverPromptRun } from '../ui.js';
import { clearParticles, spawnParticles } from '../particles.js';
import { showMainMenuScreen, showGameplayScreen, showGameOverScreen, showPreparingGameplayScreen } from '../screens.js';
import { logger } from '../logger.js';
import { notifyWarn } from '../notifier.js';
import { isTelegramMiniApp } from '../auth-telegram.js';
import { trackAnalyticsEvent } from '../analytics.js';
import { analytics } from '../analytics-events.js';
import { getInputProfile, getOnboardingHintTimelineByProfile, getOnboardingTimelineTotalDuration, markFirstRunHintShown, shouldShowFirstRunHint } from './onboarding-hints.js';
import { buildCollisionReactionMetrics } from './collision-reaction-metrics.js';
import { buildInputFeedbackMetrics } from './input-feedback-metrics.js';
import { getDifficultySegment, normalizeRunIndex } from './difficulty-segmentation.js';
import { buildGameOverSummary } from './game-over-copy.js';
import { maybeCelebrateMilestone } from './game-over-confetti.js';
import { beginAiRun, finishAiRun } from '../ai-mode.js';
const CRASH_FLYER_SRC = 'img/bear_pixel_transparent.webp'; const CRASH_FLYER_FALLBACK_SRC = 'img/bear.png';
const CRASH_FLY_DEFAULT_DURATION_MS = 6000;
const START_TRANSITION_STATIC_EYES_SRC = 'img/eyes.png';
const MENU_EYES_STATIC_SRC = 'img/eyes.png';
const RUN_INDEX_STORAGE_KEY = 'ursas_run_index';
function createGameSessionController({
  DOM,
  gameState,
  player,
  assetManager,
  getPlayerRides,
  getGameplayUpgradeSnapshot,
  getViewportDimensions,
  syncViewport,
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
  showRendererPlaceholder,
  hideRendererPlaceholder,
  warmupRendererFrame,
  destroyRenderer,
  initializeGameplayRun,
  startGameplaySimulation,
  applyGameplayUpgradeState,
  clearGameplayCollections,
  waitForPhaserSceneReady,
  renderFirstGameplayFrame
}) {
  let endGameInProgress = false;
  let runStartedAt = null;
  let currentRunIndex = 1;
  let latestGameOverSummary = null; let gameOverRunToken = 0;
  let startTransitionInProgress = false;
  function getLocalStorageSafe() {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage || null;
    } catch (_error) {
      return null;
    }
  }
  function bumpRunIndex() {
    const storage = getLocalStorageSafe();
    const previous = normalizeRunIndex(storage?.getItem(RUN_INDEX_STORAGE_KEY) || 0);
    const next = previous + 1;
    if (storage?.setItem) {
      storage.setItem(RUN_INDEX_STORAGE_KEY, String(next));
    }
    return next;
  }
  function resetUiAfterRideFailure() {
    audioManager.stopSFX('gameover_screen');
    showMainMenuScreen();
    if (DOM.darkScreen) DOM.darkScreen.style.display = 'none';
    updateRidesDisplay();
  }
  function updateGameOverDynamicCopy({ score, runIndex, bestScoreBeforeRun, bestScoreAfterRun }) {
    const { entries, playerPosition, playerInsights, gameOverPrompt } = getLeaderboardSnapshot();
    const summary = buildGameOverSummary({ score, runIndex, bestScoreBeforeRun, bestScoreAfterRun, entries, playerPosition, playerInsights, gameOverPrompt, isAuthenticated: isAuthenticated() });
    if (DOM.goTitle) DOM.goTitle.textContent = summary.title;
    if (DOM.goHeroScore) DOM.goHeroScore.textContent = Math.floor(score).toLocaleString();
    if (DOM.goBoost) { const boostText = String(summary.boostText || '').trim(); DOM.goBoost.textContent = boostText; DOM.goBoost.hidden = boostText.length === 0; }
    if (DOM.goComparison) DOM.goComparison.textContent = summary.comparison.text;
    if (DOM.goNextTarget) {
      const listTail = Array.isArray(summary.nextTarget.list) && summary.nextTarget.list.length ? `\n${summary.nextTarget.list.map((item) => `• +${Math.max(0, Number(item?.delta) || 0)} to ${item?.label || 'target'}`).join('\n')}` : '';
      DOM.goNextTarget.textContent = `${summary.nextTarget.text}${listTail}`.trim();
    }
    latestGameOverSummary = summary;
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

    darkScreen.style.display = 'none';
  }

  function playStartTransitionAnimation() {
    const darkScreen = DOM.darkScreen;
    if (!darkScreen) return;

    darkScreen.classList.remove('gameover-transition');
    darkScreen.style.display = 'flex';
    darkScreen.classList.add('start-transition-active');
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
      'bonus_shield', 'bonus_speed', 'bonus_magnet', 'bonus_invert',
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
    const {
      effects: playerEffects,
      upgrades: playerUpgrades,
      shieldSnapshot,
      spinCooldownReductionSeconds,
      radarActive,
      radarObstaclesActive,
      spinAlertLevel
    } = getGameplayUpgradeSnapshot();

    if (playerEffects) {
      applyGameplayUpgradeState({
        shieldCount: shieldSnapshot.hasStartShield ? shieldSnapshot.startShieldCount : 0,
        spinCooldownReduction: spinCooldownReductionSeconds,
        invertScoreMultiplier: 1.0,
        radarActive,
        radarObstaclesActive,
        spinAlertLevel
      });

      if (shieldSnapshot.hasStartShield) {
        logger.info(`🛡 Start with ${player.shieldCount} shield(s), max ${shieldSnapshot.maxShieldCount}`);
      }

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
        radarObstaclesActive: gameState.radarObstaclesActive,
        spinAlertLevel: gameState.spinAlertLevel
      });
    } else {
      applyGameplayUpgradeState();
      logger.info('⚪ No upgrades (wallet not connected or data not loaded)');
    }
  }

  async function actualStartGame() {
    if (gameState.running || gameState.simulationRunning || gameState.preparingGameplay) return;
    const startButtonClickedAt = performance.now();
    endGameInProgress = false;
    loopController.startMainLoop();
    stopMenuLaunchAnimation();
    showPreparingGameplayScreen();
    const preparingStartedAt = performance.now();
    await waitForPhaserSceneReady({ timeoutMs: 3000 });
    const phaserSceneReadyAt = performance.now();
    await new Promise((resolve) => {
      loopController.runAfterLayoutStabilizes(() => {
        syncViewport();
        resolve();
      });
    });
    resetGameSessionState();
      initializeGameplayRun({
        now: performance.now(),
        speed: CONFIG.SPEED_START,
        nextCurveDirection: Math.random() * Math.PI * 2,
        nextCurveStrength: 0.5 + Math.random() * 0.5
      });
      clearGameplayCollections();
      clearParticles();
      applyPlayerUpgrades();
      await renderFirstGameplayFrame();
      const firstGameplayFrameReadyAt = performance.now();
      showGameplayScreen();
      startGameplaySimulation(performance.now());
      const simulationStartedAt = performance.now();
      beginAiRun();
      runStartedAt = Date.now();
      currentRunIndex = bumpRunIndex();
      const storage = typeof window !== 'undefined' ? window.localStorage : null;
      const inputProfile = getInputProfile({ navigator: typeof navigator !== 'undefined' ? navigator : null });
      if (shouldShowFirstRunHint(storage)) {
        const timeline = getOnboardingHintTimelineByProfile(inputProfile);
        timeline.forEach(({ delayMs, text }) => {
          setTimeout(() => {
            if (gameState.running) showBonusText(text);
          }, Math.max(0, Number(delayMs) || 0));
        });
        const timelineTotalMs = getOnboardingTimelineTotalDuration(timeline);
        setTimeout(() => {
          if (gameState.running) {
            trackAnalyticsEvent('onboarding_hint_completed', {
              type: 'first_run_hint', input_profile: inputProfile
            });
            trackAnalyticsEvent('onboarding_completed', {
              type: 'first_run_hint', input_profile: inputProfile
            });
          }
        }, timelineTotalMs + 300);
        markFirstRunHintShown(storage);
        if (typeof document !== 'undefined') {
          document.body.classList.remove('onboarding-first-run');
        }
        analytics.onboardingStarted();
      }
      analytics.runStarted({
        isAuthorized: isAuthenticated(),
        ridesLeft: Number(getPlayerRides()?.totalRides ?? 0),
        source: isTelegramMiniApp() ? 'telegram' : 'web',
        mode: isUnauthRuntimeMode() ? 'unauth' : 'auth',
        runIndex: currentRunIndex,
        difficultySegment: getDifficultySegment(currentRunIndex),
      });
      audioManager.playRandomGameMusic();
      loopController.scheduleResizeStabilization();
      logger.info('[STARTUP PERF]', {
        clickToPreparingMs: Math.round(preparingStartedAt - startButtonClickedAt),
        preparingToRendererReadyMs: Math.round(phaserSceneReadyAt - preparingStartedAt),
        rendererReadyToFirstFrameMs: Math.round(firstGameplayFrameReadyAt - phaserSceneReadyAt),
        firstFrameToSimulationMs: Math.round(simulationStartedAt - firstGameplayFrameReadyAt),
        totalMs: Math.round(simulationStartedAt - startButtonClickedAt)
      });
      logger.info('✅ Game started!');
  }

  async function startGame() {
    if (startTransitionInProgress) return;
    if (!areAllAssetsReady()) {
      showBonusText('⏳ Loading sprites...');
      setTimeout(startGame, 500);
      return;
    }
    if (isAuthenticated() || hasRideLimit()) {
      await loadPlayerRides();
      const playerRides = getPlayerRides();
      if (hasRideLimit() && (playerRides.totalRides || 0) <= 0) {
        resetUiAfterRideFailure();
        notifyWarn(`🎟 No rides! ⏰ Resets in ${playerRides.resetInFormatted}. 💰 Buy a ride pack in the Store!`, { durationMs: 7000 });
        return;
      }
      const canPlay = await useRide();
      if (hasRideLimit() && !canPlay) {
        const currentRides = getPlayerRides();
        resetUiAfterRideFailure();
        notifyWarn(`🎟 No rides! ⏰ ${currentRides.resetInFormatted}. 💰 Buy a pack in the Store!`, { durationMs: 7000 });
        return;
      }
    }
    logger.info('▶️ Starting game...');
    startTransitionInProgress = true;
    audioManager.stopAll();
    showMainMenuScreen();
    playStartTransitionAnimation();
    playMenuLaunchAnimation();
    showRendererPlaceholder?.();
    audioManager.playSFX('gamestart');
    const startAfterTransition = async (phase) => {
      if (!startTransitionInProgress) return;
      startTransitionInProgress = false;
      try {
        await ensureRendererReady();
        syncViewport();
        await warmupRendererFrame({ maxWaitMs: 900 });
        hideRendererPlaceholder?.();
        stopStartTransitionAnimation();
        stopMenuLaunchAnimation();
        await actualStartGame();
      } catch (error) {
        logger.error(`❌ Phaser init failed on ${phase}:`, error);
        hideRendererPlaceholder?.();
        stopStartTransitionAnimation();
        stopMenuLaunchAnimation();
        showMainMenuScreen();
        showBonusText('⚠️ Loading failed. Please try again.');
      }
    };
    const onEnd = () => {
      audioManager.sfx.gamestart.removeEventListener('ended', onEnd);
      startAfterTransition('start');
    };
    audioManager.sfx.gamestart.addEventListener('ended', onEnd);
    setTimeout(() => {
      if (startTransitionInProgress && !gameState.running) {
        audioManager.sfx.gamestart.removeEventListener('ended', onEnd);
        startAfterTransition('start fallback');
      }
    }, 5000);
  }
  function restartFromGameOver() {
    endGameInProgress = false;
    audioManager.stopSFX('gameover_screen');
    stopGameOverCrashAnimation();
    if (DOM.darkScreen) DOM.darkScreen.style.display = 'none';
    startGame();
  }
  function endGame(reason = 'Unknown') {
    if (endGameInProgress) return;
    endGameInProgress = true;
    finishAiRun();
    const { width: viewportW, height: viewportH } = getViewportDimensions();
    resetGameSessionState();
    gameState.running = false;
    gameState.simulationRunning = false;
    gameState.preparingGameplay = false;
    gameState.heavyRenderEnabled = false;
    gameState.firstGameplayFrameReady = false;
    loopController.stopMainLoop();
    audioManager.stopMusic();

    spawnParticles(viewportW / 2, viewportH / 2, 'rgba(255, 0, 0, 1)', 30, 12);

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 100, 50, 200]);
      } catch (error) {
        logger.warn('⚠️ Vibration API failed:', error);
      }
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

    const bestScoreBeforeRun = getBestScore();
    if (gameState.score > bestScoreBeforeRun) {
      setBestScore(gameState.score);
    }
    const bestScoreAfterRun = getBestScore();
    if (gameState.distance > getBestDistance()) {
      setBestDistance(gameState.distance);
    }
    const runToken = ++gameOverRunToken; beginGameOverPromptRun(runToken);
    let saveResultPromise = Promise.resolve({ status: 'skipped', reason: 'not_started' });
    try {
      if (isEligibleForLeaderboardFlow()) {
        saveResultPromise = saveResultToLeaderboard({ runToken });
      } else if (isUnauthRuntimeMode()) {
        logger.info('⚪ Unauth runtime mode — skipping leaderboard participant flow');
      }
    } catch (error) {
      logger.warn('⚠️ Leaderboard save pipeline failed to start:', error);
      saveResultPromise = Promise.resolve({ status: 'failed', reason: 'pipeline_start_failed' });
    }

    const duration = ((gameState.distance / gameState.speed / 50) / 60).toFixed(1);
    const runDurationSec = runStartedAt ? Number(((Date.now() - runStartedAt) / 1000).toFixed(2)) : Number(duration);
    const collisionReactionMetrics = buildCollisionReactionMetrics({
      obstacleCollisionCount: gameState.obstacleCollisionCount,
      collisionWithoutReactionCount: gameState.collisionWithoutReactionCount,
    });
    const inputFeedbackMetrics = buildInputFeedbackMetrics({
      inputLatencySumMs: gameState.inputLatencySumMs,
      inputLatencySampleCount: gameState.inputLatencySampleCount,
    });
    analytics.runFinished({
      score: Math.floor(gameState.score),
      distance: Math.floor(gameState.distance),
      coinsGold: gameState.goldCoins,
      coinsSilver: gameState.silverCoins,
      durationSec: runDurationSec,
      deathReason: prettyReason,
      hadShield: false,
      runIndex: currentRunIndex,
      difficultySegment: getDifficultySegment(currentRunIndex),
      extra: { ...collisionReactionMetrics, ...inputFeedbackMetrics },
    });
    const darkScreen = DOM.darkScreen;
    if (darkScreen) {
      darkScreen.style.display = 'block';
    }
    const sfxDurationMs = Math.round((audioManager.sfx.gameover && Number.isFinite(audioManager.sfx.gameover.duration) ? audioManager.sfx.gameover.duration : 0) * 1000);
    const crashAnimDurationMs = sfxDurationMs > 0 ? sfxDurationMs : CRASH_FLY_DEFAULT_DURATION_MS;
    playGameOverCrashAnimation(crashAnimDurationMs);

    let resultShown = false;
    const showResult = () => {
      if (resultShown) return;
      resultShown = true;

      stopGameOverCrashAnimation();
      if (darkScreen) {
        darkScreen.style.display = 'none';
      }

      if (DOM.goDistance) DOM.goDistance.textContent = `${Math.floor(gameState.distance)} m`;
      if (DOM.goScore) DOM.goScore.textContent = Math.floor(gameState.score);
      if (DOM.goHeroScore) DOM.goHeroScore.textContent = Math.floor(gameState.score);
      if (DOM.goGold) DOM.goGold.textContent = gameState.goldCoins;
      if (DOM.goSilver) DOM.goSilver.textContent = gameState.silverCoins;
      if (DOM.goTime) DOM.goTime.textContent = `${duration}s`;

      updateGameOverLeaderboardNotice(
        isAuthenticated()
          ? ''
          : 'Save your score & enter leaderboard.'
      );
      updateGameOverDynamicCopy({
        score: gameState.score,
        runIndex: currentRunIndex,
        bestScoreBeforeRun,
        bestScoreAfterRun
      });

      if (DOM.goNextTarget) DOM.goNextTarget.onclick = () => {
        if (!latestGameOverSummary?.nextTarget?.hasRecommendedTarget || !latestGameOverSummary?.nextTarget?.target) return;
        trackAnalyticsEvent('game_over_target_cta_click', latestGameOverSummary.nextTarget.target);
      };

      const initialSnapshot = getLeaderboardSnapshot();
      if (!initialSnapshot.playerInsights && initialSnapshot.insightsReason === 'no_wallet') {
        trackAnalyticsEvent('game_over_insights_unavailable', { reason: 'no_wallet' });
      }
      destroyRenderer?.();
      showGameOverScreen();
      maybeCelebrateMilestone({ dom: DOM, score: gameState.score, bestScoreBeforeRun, playerPosition: Number(getLeaderboardSnapshot()?.playerPosition || 0) });
      syncAllAudioUI();
      audioManager.playSFX('gameover_screen');
      endGameInProgress = false;

      setGameOverInsightsLoading(true);
      Promise.allSettled([loadAndDisplayLeaderboard({ runToken }), fetchGameOverPreview({ score: gameState.score, distance: gameState.distance, isAuthenticated: isAuthenticated(), runToken }), saveResultPromise])
        .then((results) => {
          const settledSave = results[2];
          const saveResult = settledSave?.status === 'fulfilled' ? settledSave.value : { status: 'failed', reason: 'promise_rejected' };
          if (saveResult?.status === 'failed') notifyWarn('Result not saved', { durationMs: 2600 });
        })
        .catch((error) => {
          logger.warn('⚠️ Failed to load leaderboard after game over:', error);
        })
        .finally(() => {
          setGameOverInsightsLoading(false);
          updateGameOverDynamicCopy({ score: gameState.score, runIndex: currentRunIndex, bestScoreBeforeRun, bestScoreAfterRun });

          const snapshot = getLeaderboardSnapshot();
          if (!snapshot.playerInsights && snapshot.insightsReason) {
            trackAnalyticsEvent('game_over_insights_unavailable', { reason: snapshot.insightsReason });
          }
          if (snapshot.playerInsights && latestGameOverSummary) trackAnalyticsEvent('game_over_insights_shown', {
            mode: latestGameOverSummary.meta?.comparisonMode || 'unknown', fallbackType: latestGameOverSummary.meta?.fallbackType || null,
            hasRecommendedTarget: Boolean(latestGameOverSummary.nextTarget?.hasRecommendedTarget), rankBucket: snapshot.rankBucket || 'unknown'
          });
        });
    };

    const gameOverSfx = audioManager.sfx.gameover;
    audioManager.playSFX('gameover');

    const onEnd = () => {
      gameOverSfx?.removeEventListener('ended', onEnd);
      showResult();
    };
    gameOverSfx?.addEventListener('ended', onEnd, { once: true });

    const resultFallbackMs = isTelegramMiniApp()
      ? 900
      : Math.max(1200, Math.min(Math.max(crashAnimDurationMs, 1200), CRASH_FLY_DEFAULT_DURATION_MS));
    setTimeout(() => {
      gameOverSfx?.removeEventListener('ended', onEnd);
      showResult();
    }, resultFallbackMs);
  }

  function goToMainMenu() {
    startTransitionInProgress = false;
    hideRendererPlaceholder?.();
    endGameInProgress = false;
    logger.info('🏠 Return to main menu');
    audioManager.stopAll();
    stopMenuLaunchAnimation();
    showMainMenuScreen();
    gameState.running = false;
    gameState.simulationRunning = false;
    gameState.preparingGameplay = false;
    gameState.heavyRenderEnabled = false;
    gameState.firstGameplayFrameReady = false;
    loopController.stopMainLoop();
    clearGameplayCollections();
    clearParticles();

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
    destroyRenderer?.();
    audioManager.playMusic('menu');
    if (runStartedAt) {
      trackAnalyticsEvent('session_length', {
        seconds: Number(((Date.now() - runStartedAt) / 1000).toFixed(2))
      });
      runStartedAt = null;
    }
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
