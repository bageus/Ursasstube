import { isAuthenticated, loadAndDisplayLeaderboard, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI, fetchSharePayload } from '../api.js';
import { audioManager, restoreAudioSettings, initAudioToggles } from '../audio.js';
import { DOM, gameState } from '../state.js';
import { assetManager } from '../assets.js';
import { updateGameOverLeaderboardNotice } from '../ui.js';
import { loadPlayerUpgrades, updateRidesDisplay, resetStoreState, loadUnauthGameConfig, isStoreAvailable, isUnauthRuntimeMode } from '../store.js';
import { perfMonitor } from '../perf.js';
import { initAuth, isTelegramMiniApp, connectWalletAuth, disconnectAuth, hasWalletAuthSession, isWalletAuthMode, setAuthCallbacks, getSigningWalletAddress } from '../auth.js';
import { initializePingLifecycle, subscribeAppVisibilityLifecycle } from '../runtime-lifecycle.js';
import { initializeTelegramIntegration } from './integrations/telegram.js';
import { initializeMetaMaskIntegration } from './integrations/metamask.js';
import { logger } from '../logger.js';
import { notifyError, notifyWarn } from '../notifier.js';
import { initAiMode } from '../ai-mode.js';
import { shouldShowFirstRunHint } from './onboarding-hints.js';

let cleanupPingLifecycle = () => {};
let uiEventHandlersBound = false;
let visibilityAudioLifecycleBound = false;


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
      const shareBtn = DOM.shareResultBtn;
      const shareBtnDefaultText = shareBtn.textContent || 'SHARE RESULT';
      const wallet = getSigningWalletAddress();

      if (!wallet) {
        notifyWarn('🔗 Connect wallet first!');
        return;
      }

      shareBtn.disabled = true;
      shareBtn.textContent = 'SHARING...';

      try {
        const result = await fetchSharePayload(wallet);
        if (!result.ok) {
          if (result.status === 400) {
            notifyError('⚠️ Invalid wallet for sharing');
            return;
          }
          if (result.status === 404) {
            notifyError('⚠️ Player not found');
            return;
          }
          notifyError('⚠️ Share service is unavailable');
          return;
        }

        const postText = String(result.data?.postText || '').trim();
        const shareUrl = String(result.data?.shareUrl || '').trim();
        if (!postText || !shareUrl) {
          notifyError('⚠️ Share payload is incomplete');
          return;
        }

        const tweetText = `${postText}\n${shareUrl}`;
        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(intentUrl, '_blank', 'noopener,noreferrer');
      } catch (_error) {
        notifyError('⚠️ Share service is unavailable');
      } finally {
        shareBtn.disabled = false;
        shareBtn.textContent = shareBtnDefaultText;
      }
    });
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
    onWalletUiUpdate: updateWalletUI,
    onLoadPlayerUpgrades: loadPlayerUpgrades,
    onLoadLeaderboard: loadAndDisplayLeaderboard,
    onUpdateRidesDisplay: updateRidesDisplay,
    onAuthDisconnected: resetAuthenticatedUiState
  });
  logger.info('🔐 Authenticating...');
  await initAuth();
  syncFirstRunOnboardingUiState();

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
