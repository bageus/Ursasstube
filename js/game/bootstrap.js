import { isAuthenticated, loadAndDisplayLeaderboard, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI, fetchMyProfile } from '../api.js';
import { audioManager, restoreAudioSettings, initAudioToggles } from '../audio.js';
import { DOM, gameState } from '../state.js';
import { assetManager } from '../assets.js';
import { updateGameOverLeaderboardNotice } from '../ui.js';
import { loadPlayerUpgrades, updateRidesDisplay, resetStoreState, loadUnauthGameConfig, isStoreAvailable, isUnauthRuntimeMode } from '../store.js';
import { perfMonitor } from '../perf.js';
import { initAuth, isTelegramMiniApp, connectWalletAuth, disconnectAuth, hasWalletAuthSession, isWalletAuthMode, setAuthCallbacks, getAuthStateSnapshot } from '../auth.js';
import { initializePingLifecycle, subscribeAppVisibilityLifecycle } from '../runtime-lifecycle.js';
import { initializeTelegramIntegration } from './integrations/telegram.js';
import { initializeMetaMaskIntegration } from './integrations/metamask.js';
import { logger } from '../logger.js';
import { notifyError, notifySuccess } from '../notifier.js';
import { initAiMode } from '../ai-mode.js';
import { shouldShowFirstRunHint } from './onboarding-hints.js';
import { initPlayerMenu, openPlayerMenu, isPlayerMenuOpen, refreshPlayerMenu } from '../player-menu/index.js';
import { performShare, startXConnectFlow } from '../share/shareFlow.js';
import { captureReferralFromUrl, sendReferralAfterAuth } from '../referral/referralCapture.js';
import { SCREEN_CHANGED_EVENT } from '../runtime-events.js';

captureReferralFromUrl();

let cleanupPingLifecycle = () => {};
let uiEventHandlersBound = false;
let visibilityAudioLifecycleBound = false;

let cachedProfile = null;
let profileCacheTimestamp = 0;
// Cache TTL: 30s balances freshness vs API calls. Invalidated explicitly after share or X connect.
const PROFILE_CACHE_TTL_MS = 30000;

async function getCachedProfile() {
  const now = Date.now();
  if (cachedProfile && (now - profileCacheTimestamp) < PROFILE_CACHE_TTL_MS) {
    return cachedProfile;
  }
  cachedProfile = await fetchMyProfile();
  profileCacheTimestamp = Date.now();
  return cachedProfile;
}

function invalidateProfileCache() {
  cachedProfile = null;
  profileCacheTimestamp = 0;
}

async function updateGameOverShareButton() {
  const shareBtn = DOM.shareResultBtn;
  if (!shareBtn) return;

  if (!isAuthenticated()) {
    shareBtn.hidden = true;
    return;
  }

  shareBtn.hidden = false;
  const profile = await getCachedProfile();

  shareBtn.classList.remove('is-connect-x', 'is-share', 'is-share-rewarded');

  if (!profile?.x?.connected) {
    shareBtn.classList.add('is-connect-x');
    shareBtn.textContent = 'CONNECT X';
  } else if (profile?.canShareToday) {
    shareBtn.classList.add('is-share-rewarded');
    const gold = profile.goldRewardToday || 20;
    shareBtn.innerHTML = `SHARE +${gold} <img src="img/icon_gold.png" alt="gold" class="pm-share-gold-icon">`;
  } else {
    shareBtn.classList.add('is-share');
    shareBtn.textContent = 'SHARE RESULT';
  }
}

function updatePlayerAvatarVisibility() {
  const btn = DOM.playerAvatarBtn;
  if (!btn) return;
  const snap = getAuthStateSnapshot();
  const walletConnected =
    hasWalletAuthSession() ||
    Boolean(snap?.linkedWallet);
  btn.hidden = !walletConnected;
}

function checkXOAuthCallback() {
  if (typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const xParam = params.get('x');
  if (!xParam) return;

  const newParams = new URLSearchParams(params);
  newParams.delete('x');
  newParams.delete('username');
  newParams.delete('reason');
  const newSearch = newParams.toString();
  const newUrl = newSearch
    ? `${location.pathname}?${newSearch}${location.hash}`
    : `${location.pathname}${location.hash}`;
  try { history.replaceState(null, '', newUrl); } catch (_e) { /* ignore */ }

  if (xParam === 'connected') {
    const username = params.get('username') || '';
    notifySuccess(`✅ X connected${username ? ` as @${username}` : ''}!`);
    invalidateProfileCache();
    if (isPlayerMenuOpen()) {
      refreshPlayerMenu();
    }
  } else if (xParam === 'error') {
    const reason = params.get('reason') || 'unknown';
    notifyError(`❌ X connect failed: ${reason}`);
  }
}


function syncFirstRunOnboardingUiState() {
  if (typeof document === 'undefined') return;

  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const isFirstRun = shouldShowFirstRunHint(storage);
  document.body.classList.toggle('onboarding-first-run', isFirstRun);
}

async function resetAuthenticatedUiState() {
  resetWalletPlayerUI();
  resetStoreState();
  resetLeaderboardUI();
  await loadUnauthGameConfig();
  await loadAndDisplayLeaderboard();
  updateRidesDisplay();
  if (DOM.storeBtn) {
    DOM.storeBtn.classList.toggle('menu-hidden', !isStoreAvailable());
  }
}

function bindUiEventHandlers({ startGame, restartFromGameOver, goToMainMenu, showStore, hideStore, showRules, hideRules, toggleSfxMute, toggleMusicMute }) {
  if (uiEventHandlersBound) return;

  const actionHandlers = {
    'toggle-sfx': toggleSfxMute,
    'toggle-music': toggleMusicMute,
    'show-store': showStore,
    'start-game': startGame
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
          }
        });
        return;
      }

      shareBtn.disabled = true;
      const origHTML = shareBtn.innerHTML;
      shareBtn.innerHTML = 'SHARING...';

      try {
        await performShare({
          context: 'gameover',
          profile,
          onProfileUpdated: () => {
            invalidateProfileCache();
            updateGameOverShareButton();
          }
        });
      } finally {
        shareBtn.disabled = false;
        shareBtn.innerHTML = origHTML;
      }
    });
  }

  if (DOM.playerAvatarBtn) {
    DOM.playerAvatarBtn.addEventListener('click', () => openPlayerMenu());
  }

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

    audioManager.resumeMusic();
  }, { emitInitial: false });

  visibilityAudioLifecycleBound = true;
}

async function initGameBootstrapFlow({ startGame, restartFromGameOver, goToMainMenu, startMainLoop, showStore, hideStore, showRules, hideRules, toggleSfxMute, toggleMusicMute, prepareViewport }) {
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

    assetManager.loadDeferred()
      .then(() => logger.info('✅ Deferred bezel assets loaded'))
      .catch((e) => logger.warn('⚠️ Deferred bezel assets failed:', e));
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
      updatePlayerAvatarVisibility();
      resetAuthenticatedUiState();
    },
    onAuthAuthenticated: () => {
      updatePlayerAvatarVisibility();
      sendReferralAfterAuth();
    }
  });
  logger.info('🔐 Authenticating...');
  await initAuth();
  syncFirstRunOnboardingUiState();

  initPlayerMenu();
  checkXOAuthCallback();
  updatePlayerAvatarVisibility();

  if (!isAuthenticated()) {
    await loadUnauthGameConfig();
    updateRidesDisplay();
  }

  if (!isTelegramMiniApp()) {
    DOM.walletBtn.onclick = connectWalletAuth;
  }

  logger.info('📊 Loading leaderboard...');
  try {
    updateGameOverLeaderboardNotice();
    await loadAndDisplayLeaderboard();
    logger.info('✅ Leaderboard loaded');
  } catch (error) {
    logger.warn('⚠️ Leaderboard loading error:', error);
  }

  if (DOM.storeBtn) {
    DOM.storeBtn.classList.toggle('menu-hidden', !isStoreAvailable());
  }

  if (hasWalletAuthSession() || isUnauthRuntimeMode()) {
    updateRidesDisplay();
  }

  audioManager.playMusic('menu');
  if (typeof prepareViewport === 'function') {
    prepareViewport();
  }

  logger.info('▶️ Starting main loop...');
  startMainLoop();

  window.addEventListener(SCREEN_CHANGED_EVENT, (event) => {
    const screen = event.detail?.screen;
    if (screen === 'game-over') {
      invalidateProfileCache();
      updateGameOverShareButton().catch(() => {});
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

  logger.info('✅ Game fully initialized!');
}

export { initGameBootstrapFlow };
