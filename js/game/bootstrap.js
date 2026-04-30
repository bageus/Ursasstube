import { isAuthenticated, loadAndDisplayLeaderboard, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI, fetchMyProfile } from '../api.js';
import { audioManager, restoreAudioSettings, initAudioToggles } from '../audio.js';
import { DOM, gameState } from '../state.js';
import { assetManager } from '../assets.js';
import { updateGameOverLeaderboardNotice, getLeaderboardSnapshot } from '../ui.js';
import { loadPlayerUpgrades, updateRidesDisplay, resetStoreState, loadUnauthGameConfig, isStoreAvailable, isUnauthRuntimeMode } from '../store.js';
import { perfMonitor } from '../perf.js';
import { initAuth, isTelegramMiniApp, connectWalletAuth, disconnectAuth, hasWalletAuthSession, isWalletAuthMode, setAuthCallbacks, getAuthStateSnapshot } from '../auth.js';
import { initializePingLifecycle, subscribeAppVisibilityLifecycle, SCREEN_CHANGED_EVENT } from '../core/runtime.js';
import { initializeTelegramIntegration } from './integrations/telegram.js';
import { initializeMetaMaskIntegration } from './integrations/metamask.js';
import { logger } from '../logger.js';
import { notifyError, notifySuccess } from '../notifier.js';
import { trackAnalyticsEvent } from '../analytics.js';
import { initAiMode } from '../ai-mode.js';
import { shouldShowFirstRunHint } from './onboarding-hints.js';
import { initPlayerMenu, openPlayerMenu, isPlayerMenuOpen, refreshPlayerMenu } from '../player-menu/index.js';
import { performShare, startXConnectFlow } from '../share/shareFlow.js';
import { captureReferralFromUrl, sendReferralAfterAuth } from '../referral/referralCapture.js';
import { identifyPostHogUser, resetPostHogUser } from '../integrations/posthog/index.js';

captureReferralFromUrl();

let cleanupPingLifecycle = () => {};
let uiEventHandlersBound = false;
let visibilityAudioLifecycleBound = false;

let cachedProfile = null;
let profileCacheTimestamp = 0;
// Cache TTL: 30s balances freshness vs API calls. Invalidated explicitly after share or X connect.
const PROFILE_CACHE_TTL_MS = 30000;

// Flag: true only when the user actively initiated a wallet connect this session tick.
let _walletJustConnected = false;
// Tracks whether a wallet session was active on the previous auth callback.
let _lastKnownWalletSession = false;

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

// ===== RANK WATCHER =====

function getRankToastSessionKey(primaryId) {
  return `rankToastShown_${primaryId}`;
}

function isValidDelta(delta) {
  return delta != null && Number.isFinite(Number(delta)) && Number(delta) > 0;
}

function buildTakeBackSub(snapshot, lostPosition) {
  if (lostPosition === null || !(lostPosition > 0)) return null;
  const list = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  const targetScore = Number(list[lostPosition - 1]?.score ?? 0);
  if (Number.isFinite(targetScore) && targetScore > 0) {
    return `+${(targetScore + 1).toLocaleString('en-US')} to take back`;
  }
  return null;
}

function showRankLossToast(profile, primaryId) {
  if (!profile || !primaryId) {
    logger.debug('rank-loss toast: skip — no profile/primaryId');
    return;
  }
  if (!hasWalletAuthSession()) {
    logger.debug('rank-loss toast: skip — no wallet session');
    return;
  }
  if (typeof sessionStorage === 'undefined') {
    logger.debug('rank-loss toast: skip — sessionStorage unavailable');
    return;
  }

  const rankDelta = Number(profile?.rankDelta || 0);
  if (!(rankDelta > 0)) {
    logger.debug('rank-loss toast: skip — rankDelta', rankDelta);
    return;
  }

  const sessionKey = getRankToastSessionKey(primaryId);
  if (sessionStorage.getItem(sessionKey)) {
    logger.debug('rank-loss toast: skip — already shown this session');
    return;
  }

  const currentRank = Number(profile?.rank || 0);
  const lostPosition = currentRank > 0 && rankDelta > 0 ? currentRank - rankDelta : null;

  let sub = null;
  if (lostPosition !== null) {
    const snapshot = getLeaderboardSnapshot();
    sub = buildTakeBackSub(snapshot, lostPosition) ?? `Take back #${lostPosition}`;
  }

  notifySuccess(`🏃 You lost ${rankDelta} position${rankDelta === 1 ? '' : 's'}`, { sub });
  sessionStorage.setItem(sessionKey, '1');
}

// ===== START HOOK =====

/**
 * Visibility matrix for the "Take back #N" start hook:
 *
 * | Situation                                              | hasWalletAuthSession() | rankDelta > 0 | Hook   |
 * |--------------------------------------------------------|------------------------|---------------|--------|
 * | Not authenticated                                      | false                  | —             | hidden |
 * | TG-auth, no wallet                                     | false                  | —             | hidden |
 * | TG-auth, wallet linked in DB (but session = TG)        | false                  | —             | hidden |  ← was a bug
 * | Wallet-auth, rankDelta = 0                             | true                   | false         | hidden |
 * | Wallet-auth, rankDelta > 0                             | true                   | true          | shown  |
 * | Wallet-auth, rankDelta > 0, but dismissed this session | true                   | true          | hidden |
 */
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
  await loadAndDisplayLeaderboard();
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
    return startGame(...args);
  };

  const actionHandlers = {
    'toggle-sfx': toggleSfxMute,
    'toggle-music': toggleMusicMute,
    'show-store': showStore,
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
    },
    onAuthAuthenticated: () => {
      updatePlayerAvatarVisibility();
      sendReferralAfterAuth();
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
  await initAuth();
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

  logger.info('⏸ Main loop deferred until first gameplay start');

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
