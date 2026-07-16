import { isAuthenticated, loadAndDisplayLeaderboard, refreshPlayerStats, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI } from '../api.js';
import { audioManager, restoreAudioSettings, initAudioToggles } from '../audio.js';
import { DOM, gameState } from '../state.js';
import { assetManager } from '../assets.js';
import { updateGameOverLeaderboardNotice, getLeaderboardSnapshot } from '../ui.js';
import { loadPlayerUpgrades, updateRidesDisplay, resetStoreState, loadUnauthGameConfig, isStoreAvailable, isUnauthRuntimeMode } from '../features/store/index.js';
import { perfMonitor } from '../perf.js';
import { initAuth, isTelegramMiniApp, connectWalletAuth, disconnectAuth, hasWalletAuthSession, isWalletAuthMode, setAuthCallbacks, getAuthStateSnapshot, hideWalletButtonInTelegram } from '../features/auth/index.js';
import { initializePingLifecycle, subscribeAppVisibilityLifecycle, SCREEN_CHANGED_EVENT, isMobileAudioRuntime } from '../core/runtime.js';
import { initializeTelegramIntegration } from './integrations/telegram.js';
import { initializeMetaMaskIntegration } from './integrations/metamask.js';
import { logger } from '../logger.js';
import { notifyError } from '../notifier.js';
import { trackAnalyticsEvent } from '../analytics.js';
import { initAiMode } from '../ai-mode.js';
import { initPlayerMenu, openPlayerMenu } from '../features/player-menu/index.js';
import { initOnboardingFeature, refreshOnboardingState, applyOnboardingForScreen, dismissGuestOnboardingOnWalletConnect } from '../features/onboarding/index.js';
import { performShare, startXConnectFlow } from '../share/shareFlow.js';
import { identifyPostHogUser, resetPostHogUser } from '../integrations/posthog/index.js';
import { trackTelegramEvent } from '../telegram-analytics.js';
import { markGameRuntimeReady } from '../app-loading.js';
import { enforceTelegramWalletUiHidden, getCachedProfile, invalidateProfileCache, cancelGameOverOnboardingRetries, refreshOnboardingAfterLeaderboardSaveSuccess, updateGameOverShareButton, updatePlayerAvatarVisibility, checkXOAuthCallback, syncFirstRunOnboardingUiState } from './bootstrap/profile-share-setup.js';
import { buildTakeBackSub, showRankLossToast } from './bootstrap/rank-feedback.js';
let cleanupPingLifecycle = () => {};
let uiEventHandlersBound = false;
let visibilityAudioLifecycleBound = false;
const LEADERBOARD_SAVE_SUCCESS_EVENT = 'ursas:leaderboard-save-success';
// Flag: true only when the user actively initiated a wallet connect this session tick.
let _walletJustConnected = false;
// Tracks whether a wallet session was active on the previous auth callback.
let _lastKnownWalletSession = false;

// ===== START HOOK =====

async function updateStartHook() {
  const hook = DOM.startHook;
  if (!hook) return;

  const hide = () => {
    hook.hidden = true;
    hook.setAttribute('aria-hidden', 'true');
  };

  // 1. Dismissed in this session — hide immediately
  if (sessionStorage.getItem('startHookDismissed') === '1') {
    logger.debug('start-hook: skip — dismissed this session');
    return hide();
  }

  // 2. Wallet must be connected IN THIS SESSION (wallet-auth mode), not just linked in DB
  if (!hasWalletAuthSession()) {
    logger.debug('start-hook: skip — no wallet session');
    return hide();
  }

  const profile = await getCachedProfile();
  const rankDelta = Number(profile?.rankDelta || 0);

  // 3. Player must have actually lost positions
  if (!(rankDelta > 0)) {
    logger.debug('start-hook: skip — rankDelta', rankDelta);
    return hide();
  }

  const textEl = hook.querySelector('.start-hook-text');
  const currentRank = Number(profile?.rank || 0);
  const lostPosition = currentRank > 0 && rankDelta > 0 ? currentRank - rankDelta : null;
  if (textEl) {
    textEl.textContent = lostPosition !== null ? `Take back #${lostPosition}` : 'Take back your rank';
  }
  let sub = hook.querySelector('.start-hook-sub');
  if (!sub) {
    sub = document.createElement('span');
    sub.className = 'start-hook-sub';
    hook.querySelector('.start-hook-main')?.after(sub) || hook.appendChild(sub);
  }
  const snapshot = getLeaderboardSnapshot();
  const subText = buildTakeBackSub(snapshot, lostPosition);
  if (subText) {
    sub.textContent = subText;
    sub.hidden = false;
  } else {
    sub.hidden = true;
  }

  hook.hidden = false;
  hook.setAttribute('aria-hidden', 'false');
}

async function resetAuthenticatedUiState() {
  resetWalletPlayerUI();
  resetStoreState();
  resetLeaderboardUI();
  await loadUnauthGameConfig();
  loadAndDisplayLeaderboard().catch((error) => {
    logger.warn('⚠️ Leaderboard refresh failed during auth reset (non-fatal):', error);
  });
  updateRidesDisplay();

  if (DOM.storeBtn) {
    DOM.storeBtn.classList.toggle('menu-hidden', !isStoreAvailable());
  }
}

function bindUiEventHandlers({ startGame, restartFromGameOver, goToMainMenu, showStore, hideStore, showRules, hideRules, toggleSfxMute, toggleMusicMute }) {
  if (uiEventHandlersBound) return;

  const wrappedStartGame = (...args) => {
    // Dismiss hook for this session when player starts a game
    sessionStorage.setItem('startHookDismissed', '1');
    if (DOM.startHook) {
      DOM.startHook.hidden = true;
      DOM.startHook.setAttribute('aria-hidden', 'true');
    }
    audioManager.markUserGesture();
    audioManager.unlockAudio().catch(() => {});
    if (document.body.classList.contains('loading-ui') || !document.body.classList.contains('app-ready')) return;
    return startGame(...args);
  };

  const onFirstGesture = () => {
    audioManager.markUserGesture();
    audioManager.unlockAudio().catch(() => {});
  };
  document.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  document.addEventListener('touchend', onFirstGesture, { once: true, passive: true });
  document.addEventListener('click', onFirstGesture, { once: true, passive: true });

  const actionHandlers = {
    'toggle-sfx': toggleSfxMute,
    'toggle-music': toggleMusicMute,
    'show-store': () => {
      trackTelegramEvent('upload_opened');
      const result = showStore();
      refreshOnboardingState({ reason: 'store_open_click' }).catch(() => {});
      return result;
    },
    'start-game': wrappedStartGame
  };

  document.querySelectorAll('[data-action]').forEach((el) => {
    const handler = actionHandlers[el.dataset.action];
    if (handler) el.addEventListener('click', handler);
  });

  if (DOM.rulesLink) DOM.rulesLink.addEventListener('click', showRules);
  if (DOM.restartBtn) DOM.restartBtn.addEventListener('click', restartFromGameOver);
  if (DOM.shareResultBtn) {
    DOM.shareResultBtn.addEventListener('click', async () => {
      if (!isAuthenticated()) return;

      const shareBtn = DOM.shareResultBtn;
      const profile = await getCachedProfile();

      if (!profile?.x?.connected) {
        await startXConnectFlow({
          onConnected: () => {
            invalidateProfileCache();
            updateGameOverShareButton();
            refreshOnboardingState({ reason: 'share_connect_x' }).catch(() => {});
          }
        });
        return;
      }

      shareBtn.disabled = true;
      const origHTML = shareBtn.innerHTML;
      shareBtn.innerHTML = 'SHARING...';

      try {
        trackTelegramEvent('share_clicked', { videoId: 'game_run_result' });
        await performShare({
          context: 'gameover',
          profile,
          onProfileUpdated: () => {
            invalidateProfileCache();
            updateGameOverShareButton();
            refreshPlayerStats({ refreshLeaderboard: true }).catch(() => {});
            refreshOnboardingState({ reason: 'share_confirmed' }).catch(() => {});
          }
        });
      } finally {
        shareBtn.disabled = false;
        shareBtn.innerHTML = origHTML;
      }
    });
  }

  if (DOM.playerAvatarBtn) {
    DOM.playerAvatarBtn.addEventListener('click', async () => {
      await openPlayerMenu();
      refreshOnboardingState({ screen: 'player-menu', reason: 'player_menu_open' }).catch(() => {});
      applyOnboardingForScreen('player-menu');
    });
  }
  document.querySelectorAll('.lb-title').forEach((el) => {
    el.addEventListener('click', () => {
      trackAnalyticsEvent('leaderboard_opened', {
        source: 'top_button'
      });
    });
  });

  if (DOM.menuBtn) DOM.menuBtn.addEventListener('click', goToMainMenu);
  if (DOM.storeBackBtn) DOM.storeBackBtn.addEventListener('click', hideStore);
  if (DOM.rulesBackBtn) DOM.rulesBackBtn.addEventListener('click', hideRules);

  uiEventHandlersBound = true;
}

function bindVisibilityAudioLifecycle() {
  if (visibilityAudioLifecycleBound) return;

  subscribeAppVisibilityLifecycle((hidden) => {
    gameState.visibilitySuspended = hidden;

    if (hidden) {
      audioManager.suspendMusic();
      return;
    }

    audioManager.ensureMusicForCurrentScreen();
  }, { emitInitial: false });

  visibilityAudioLifecycleBound = true;
}

async function initGameBootstrapFlow({ startGame, restartFromGameOver, goToMainMenu, showStore, hideStore, showRules, hideRules, toggleSfxMute, toggleMusicMute, prepareViewport }) {
  logger.info('🎮 Initializing game...');
  bindUiEventHandlers({
    startGame,
    restartFromGameOver,
    goToMainMenu,
    showStore,
    hideStore,
    showRules,
    hideRules,
    toggleSfxMute,
    toggleMusicMute
  });

  initializeTelegramIntegration();
  initAiMode();

  try {
    await assetManager.loadAll();
    if (!assetManager.isReady()) throw new Error('AssetManager not ready');
    logger.info('✅ All assets loaded!');

    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
    scheduleIdle(() => {
      assetManager.loadDeferred()
        .then(() => logger.info('✅ Deferred bezel assets loaded'))
        .catch((e) => logger.warn('⚠️ Deferred bezel assets failed:', e));
    }, { timeout: 2000 });
  } catch (error) {
    logger.error('❌ Asset loading error:', error);
    notifyError('❌ Failed to load game. Please reload the page.');
    return;
  }

  logger.info('🔊 Initializing audio...');
  audioManager.init();
  logger.info('✅ Audio ready');

  logger.info('⚙️ Restoring settings...');
  restoreAudioSettings();
  initAudioToggles();
  bindVisibilityAudioLifecycle();

  setAuthCallbacks({
    onWalletUiUpdate: async () => {
      await updateWalletUI();
      updatePlayerAvatarVisibility();
    },
    onLoadPlayerUpgrades: loadPlayerUpgrades,
    onLoadLeaderboard: loadAndDisplayLeaderboard,
    onUpdateRidesDisplay: updateRidesDisplay,
    onAuthDisconnected: () => {
      resetPostHogUser();
      updatePlayerAvatarVisibility();
      resetAuthenticatedUiState();
      updateStartHook().catch(() => {});
      refreshOnboardingState({ reason: 'auth_disconnected' }).catch(() => {});
    },
    onAuthAuthenticated: () => {
      dismissGuestOnboardingOnWalletConnect();
      updatePlayerAvatarVisibility();
      refreshOnboardingState({ reason: 'auth_connected' })
        .then(() => applyOnboardingForScreen())
        .catch(() => {});
      const hadWalletSessionBefore = _lastKnownWalletSession;
      const hasWalletNow = hasWalletAuthSession();
      _lastKnownWalletSession = hasWalletNow;
      const isFreshWalletAuth = hasWalletNow && !hadWalletSessionBefore;
      const isFreshConnect = _walletJustConnected || isFreshWalletAuth;
      _walletJustConnected = false;
      const snap = getAuthStateSnapshot();
      const primaryId = snap?.primaryId;
      if (primaryId) {
        const authMode = hasWalletAuthSession() ? 'wallet' : 'telegram';
        identifyPostHogUser({
          id: primaryId,
          source: authMode,
          properties: {
            auth_mode: authMode,
            has_wallet_session: hasWalletAuthSession(),
            linked_wallet: Boolean(snap?.linkedWallet)
          }
        });
      }

      // Invalidate profile cache unconditionally so getCachedProfile() fetches fresh data
      // from the server and returns an accurate rankDelta (cached data may be stale/anon).
      invalidateProfileCache();

      getCachedProfile().then((profile) => {
        logger.info('🏃 rank-loss check', {
          hasProfile: !!profile,
          hasPrimaryId: !!primaryId,
          isFreshConnect,
          rankDelta: profile?.rankDelta ?? null,
          rank: profile?.rank ?? null,
          hasWalletSession: hasWalletAuthSession()
        });
        if (profile && primaryId && isFreshConnect) {
          showRankLossToast(profile, primaryId);
        }
        updateStartHook();
      }).catch((e) => {
        logger.warn('rank-loss profile fetch failed', e);
      });
    }
  });
  logger.info('🔐 Authenticating...');
  hideWalletButtonInTelegram();
  await initAuth();
  hideWalletButtonInTelegram();
  enforceTelegramWalletUiHidden();
  initOnboardingFeature()
    .then(() => {
      refreshOnboardingState({ reason: 'auth' }).catch(() => {});
      applyOnboardingForScreen();
    })
    .catch((error) => {
      logger.warn('⚠️ Onboarding init failed, continuing without onboarding:', error);
    });
  updateStartHook().catch(() => {});
  syncFirstRunOnboardingUiState();

  initPlayerMenu();
  checkXOAuthCallback();
  updatePlayerAvatarVisibility();

  if (!isAuthenticated()) {
    await loadUnauthGameConfig();
    updateRidesDisplay();
  }

  if (!isTelegramMiniApp()) {
    DOM.walletBtn.onclick = () => {
      _walletJustConnected = true;
      connectWalletAuth();
    };
  }

  logger.info('📊 Loading leaderboard in background...');
  updateGameOverLeaderboardNotice();
  loadAndDisplayLeaderboard()
    .then(() => {
      logger.info('✅ Leaderboard loaded');
    })
    .catch((error) => {
      logger.warn('⚠️ Leaderboard loading error:', error);
    });

  if (DOM.storeBtn) {
    DOM.storeBtn.classList.toggle('menu-hidden', !isStoreAvailable());
  }

  if (hasWalletAuthSession() || isUnauthRuntimeMode()) {
    updateRidesDisplay();
  }

  audioManager.setScreen('menu');
  audioManager.prepareMenuAudio();
  audioManager.preloadSfx();
  if (isMobileAudioRuntime()) {
    audioManager.preloadMenuMusic();
  } else {
    audioManager.preloadGameMusic();
  }
  if (typeof prepareViewport === 'function') {
    prepareViewport();
  }

  logger.info('⏸ Main loop deferred until first gameplay start');
  let previousScreen = null;
  window.addEventListener(SCREEN_CHANGED_EVENT, (event) => {
    hideWalletButtonInTelegram();
    const screen = event.detail?.screen;
    audioManager.setScreen(screen);
    applyOnboardingForScreen(screen);
    if (screen === 'game-over') {
      invalidateProfileCache();
      updateGameOverShareButton().catch(() => {});
    } else {
      cancelGameOverOnboardingRetries();
    }
    if (screen === 'store') refreshOnboardingState({ reason: 'store_open' }).catch(() => {});
    else if (previousScreen === 'store' && screen === 'menu') refreshOnboardingState({ reason: 'menu_open_after_store', screen: 'menu', resetCache: true }).then(() => applyOnboardingForScreen('menu')).catch(() => {});
    previousScreen = screen;
  });

  window.addEventListener('ursas:onboarding-store-buy', () => {
    refreshOnboardingState({ reason: 'store_buy' }).catch(() => {});
  });
  window.addEventListener(LEADERBOARD_SAVE_SUCCESS_EVENT, (event) => {
    const status = event?.detail?.status;
    if (status === 'saved' || status === 'already_submitted') {
      refreshOnboardingAfterLeaderboardSaveSuccess().catch(() => {});
    }
  });

  initializeMetaMaskIntegration({
    onDisconnect: disconnectAuth,
    onReconnect: () => {
      if (isWalletAuthMode()) {
        disconnectAuth();
        connectWalletAuth();
      }
    },
    onChainChanged: () => {
      location.reload();
    }
  });

  cleanupPingLifecycle();
  cleanupPingLifecycle = initializePingLifecycle({
    shouldMeasureInterval: () => hasWalletAuthSession() && gameState.running,
    shouldMeasureInitial: () => hasWalletAuthSession(),
    measurePing: () => perfMonitor.measurePing()
  });

  try {
    markGameRuntimeReady();
  } catch (error) {
    logger.warn('Game runtime readiness marker failed', error);
  }
  logger.info('✅ Game fully initialized!');
}

export { initGameBootstrapFlow };
