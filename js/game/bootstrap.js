import { isAuthenticated, loadAndDisplayLeaderboard, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI } from '../api.js';
import { audioManager, restoreAudioSettings, initAudioToggles } from '../audio.js';
import { DOM, gameState } from '../state.js';
import { assetManager } from '../assets.js';
import { updateGameOverLeaderboardNotice } from '../ui.js';
import { loadPlayerUpgrades, updateRidesDisplay, resetStoreState, loadUnauthGameConfig, isStoreAvailable, isUnauthRuntimeMode } from '../store.js';
import { perfMonitor } from '../perf.js';
import { initAuth, isTelegramMiniApp, connectWalletAuth, disconnectAuth, hasWalletAuthSession, isWalletAuthMode, setAuthCallbacks } from '../auth.js';
import { initializePingLifecycle, subscribeAppVisibilityLifecycle } from '../runtime-lifecycle.js';
import { initializeTelegramIntegration } from './integrations/telegram.js';
import { initializeMetaMaskIntegration } from './integrations/metamask.js';
import { logger } from '../logger.js';

let cleanupPingLifecycle = () => {};
let uiEventHandlersBound = false;
let visibilityAudioLifecycleBound = false;

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

  try {
    await assetManager.loadAll();
    if (!assetManager.isReady()) throw new Error('AssetManager not ready');
    logger.info('✅ All assets loaded!');

    assetManager.loadDeferred()
      .then(() => logger.info('✅ Deferred bezel assets loaded'))
      .catch((e) => logger.warn('⚠️ Deferred bezel assets failed:', e));
  } catch (error) {
    logger.error('❌ Asset loading error:', error);
    alert('❌ Failed to load game. Please reload the page.');
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
