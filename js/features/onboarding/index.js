import { fetchOnboardingState, postOnboardingEvent, resetOnboardingStateCache } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { hideSpotlight, showSpotlight } from './spotlight.js';
import { hideMenuStartHook, clearGameOverOnboardingHook } from './hooks.js';
import { mountGiftIndicator, unmountGiftIndicator, renderActiveBoostIndicators } from './gift-indicator.js';
import { logger } from '../../logger.js';
import { hasAuthenticatedSession, isTelegramMiniApp } from '../auth/index.js';

const WEB_GUEST_ONBOARDING_DISMISSED_KEY = 'ursas.guest.onboarding.dismissed.v1';
const AUTH_SCREENS = new Set(['menu', 'game-over', 'store']);

let onboardingState = { ...DEFAULT_ONBOARDING_STATE };
let currentScreen = 'menu';
let lastShownSignature = '';

const TARGET_SELECTOR_MAP = Object.freeze({
  start_game: '#startBtn',
  play_again: '#restartBtn',
  connect_x_or_share_result: '#shareResultBtn',
  store_button: '#storeBtn',
  store_back: '#storeBackBtn',
  ride_pack_3: '#store-ride-pack-3',
  radar_obstacles_card: '#store-radarobstacles-0',
  radar_gold_card: '#store-radargold-0'
});

function isAuthorizedRuntime() {
  return isTelegramMiniApp() || hasAuthenticatedSession();
}
function getStorage() { try { return window.localStorage || null; } catch (_) { return null; } }
function readGuestDismissed() { return getStorage()?.getItem(WEB_GUEST_ONBOARDING_DISMISSED_KEY) === '1'; }
function writeGuestDismissed() { getStorage()?.setItem(WEB_GUEST_ONBOARDING_DISMISSED_KEY, '1'); }

function getHookText(active) {
  if (active?.hook) return String(active.hook);
  const map = {
    first_race: 'Take the lead / Start your first race',
    second_race_game_over: 'Play again and get +100', second_race_menu: 'Play again and get +100',
    third_race_game_over: 'Play again and get +100', third_race_menu: 'Play again and get +100',
    share_result_game_over: 'Share your result and get a bonus', share_result_menu: 'Connect X and get a bonus',
    store_start: 'Open Store to upgrade your runs', store_in: 'Highlight +3 rides pack'
  };
  return map[active?.key] || '';
}

async function sendEvent(action, active) {
  if (!active?.key) return;
  await postOnboardingEvent({ action, key: active.key, screen: active.screen, target: active.target });
}

function showAuthorizedOnboarding(active) {
  if (!active || !AUTH_SCREENS.has(currentScreen) || active.screen !== currentScreen) return;
  const selector = TARGET_SELECTOR_MAP[active.target];
  if (!selector) { logger.warn('⚠️ onboarding target mapping missing', { target: active.target }); return; }

  let attempts = 0;
  const render = () => {
    attempts += 1;
    const shown = showSpotlight({
      target: selector,
      text: getHookText(active),
      showSkip: true,
      onSkip: async () => { await sendEvent('skip', active); hideSpotlight(); },
      onTargetClick: async () => { await sendEvent('complete', active); hideSpotlight(); }
    });
    if (shown) {
      const sig = `${active.key}:${active.screen}:${active.target}`;
      if (lastShownSignature !== sig) {
        lastShownSignature = sig;
        sendEvent('shown', active).catch(() => {});
      }
      return;
    }
    if (attempts >= 10) {
      logger.warn('⚠️ onboarding spotlight target not found', { selector, active, attempts });
      return;
    }
    requestAnimationFrame(() => setTimeout(render, 50));
  };
  render();
}

function applyOnboardingUiState() {
  hideMenuStartHook();
  clearGameOverOnboardingHook();
  hideSpotlight();
  unmountGiftIndicator();
  renderActiveBoostIndicators(onboardingState.activeBoosts || {});

  if (!isAuthorizedRuntime()) {
    if (isTelegramMiniApp()) return;
    if (readGuestDismissed()) return;
    showSpotlight({
      target: '#startBtn', text: 'Start your first run', showSkip: true,
      onSkip: () => { writeGuestDismissed(); hideSpotlight(); },
      onTargetClick: () => { writeGuestDismissed(); hideSpotlight(); }
    });
    return;
  }

  const gifts = onboardingState.gifts || {};
  if (currentScreen === 'menu' && gifts.radar_obstacles_24h?.available) {
    mountGiftIndicator({ onClick: () => document.querySelector('#storeBtn')?.click?.() });
  }
  if (currentScreen === 'menu' && gifts.radar_gold_24h?.available) {
    mountGiftIndicator({ onClick: () => document.querySelector('#storeBtn')?.click?.() });
  }

  showAuthorizedOnboarding(onboardingState.activeOnboarding);
}

async function refreshOnboardingState({ reason = 'manual', screen = null, resetCache = false } = {}) {
  if (resetCache || String(reason).startsWith('auth_')) {
    resetOnboardingStateCache({ clearIdentity: true });
    onboardingState = { ...DEFAULT_ONBOARDING_STATE };
  }
  const remote = await fetchOnboardingState({ screen: screen || currentScreen });
  if (remote) onboardingState = writeCachedOnboardingState(remote);
  else if (!isAuthorizedRuntime()) onboardingState = readCachedOnboardingState();
  applyOnboardingUiState();
  return { ...onboardingState };
}

function applyOnboardingForScreen(screen) {
  currentScreen = String(screen || currentScreen || 'menu');
  if (isAuthorizedRuntime() && AUTH_SCREENS.has(currentScreen)) {
    refreshOnboardingState({ reason: `screen_${currentScreen}`, screen: currentScreen }).catch(() => applyOnboardingUiState());
    return;
  }
  applyOnboardingUiState();
}

async function initOnboardingFeature() {
  onboardingState = readCachedOnboardingState();
  await refreshOnboardingState({ reason: 'init' });
  return { ...onboardingState };
}

function dismissGuestOnboardingOnWalletConnect() {
  writeGuestDismissed();
}

export { initOnboardingFeature, refreshOnboardingState, applyOnboardingForScreen, dismissGuestOnboardingOnWalletConnect };
