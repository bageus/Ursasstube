import { fetchOnboardingState, postOnboardingEvent, resetOnboardingStateCache } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { hideSpotlight, showSpotlight } from './spotlight.js';
import { hideMenuStartHook, clearGameOverOnboardingHook } from './hooks.js';
import { mountGiftIndicator, unmountGiftIndicator, renderActiveBoostIndicators } from './gift-indicator.js';
import { logger } from '../../logger.js';
import { hasAuthenticatedSession, isTelegramMiniApp } from '../auth/index.js';

const WEB_GUEST_ONBOARDING_DISMISSED_KEY = 'ursas.guest.onboarding.dismissed.v1';
const AUTH_SCREENS = new Set(['menu', 'game-over', 'store']);

const SCREEN_ALIASES = Object.freeze({
  main: 'menu',
  home: 'menu',
  gameover: 'game-over'
});

let onboardingState = { ...DEFAULT_ONBOARDING_STATE };
let currentScreen = 'menu';
let lastShownSignature = '';

const TARGET_SELECTOR_MAP = Object.freeze({
  start_game: '#startBtn',
  play_again: '#restartBtn, [data-action="restart-game"], .go-play-again, .play-again-btn',
  connect_x_or_share_result: '#shareResultBtn',
  store_button: '#storeBtn',
  store_back: '#storeBackBtn',
  ride_pack_3: '#store-ride-pack-3',
  radar_obstacles_card: '#store-radarobstacles-0',
  radar_gold_card: '#store-radargold-0'
});

const ONBOARDING_FALLBACK_FLOW = [
  { key: 'first_race', screen: 'menu', target: 'start_game', when: (state) => state.raceCount === 0 },
  { key: 'second_race_game_over', screen: 'game-over', target: 'play_again', hook: 'Play again and get +100 silver', when: (state) => state.raceCount === 1 },
  { key: 'second_race_menu', screen: 'menu', target: 'start_game', hook: 'Play again and get +100 silver', when: (state) => state.raceCount === 1 },
  { key: 'third_race_game_over', screen: 'game-over', target: 'play_again', hook: 'Play again and get +100 gold', when: (state) => state.raceCount === 2 },
  { key: 'third_race_menu', screen: 'menu', target: 'start_game', hook: 'Play again and get +100 gold', when: (state) => state.raceCount === 2 },
  { key: 'share_result_game_over', screen: 'game-over', target: 'connect_x_or_share_result', when: (state) => state.raceCount >= 3 && !state.xConnected },
  { key: 'share_result_menu', screen: 'menu', target: 'connect_x_or_share_result', when: (state) => state.raceCount >= 3 && !state.xConnected },
  { key: 'store_start', screen: 'menu', target: 'store_button', when: (state) => state.raceCount >= 3 },
  { key: 'store_in', screen: 'store', target: 'ride_pack_3', when: (state) => state.raceCount >= 3 },
  { key: 'gift_radar_obstacles_store', screen: 'store', target: 'radar_obstacles_card', when: (state) => state.gifts?.radar_obstacles_24h?.available },
  { key: 'gift_radar_gold_store', screen: 'store', target: 'radar_gold_card', when: (state) => state.gifts?.radar_gold_24h?.available }
];

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
    second_race_game_over: 'Play again and get +100 silver', second_race_menu: 'Play again and get +100 silver',
    third_race_game_over: 'Play again and get +100 gold', third_race_menu: 'Play again and get +100 gold',
    share_result_game_over: 'Share your result and get a bonus', share_result_menu: 'Connect X and get a bonus',
    store_start: 'Open Store to upgrade your runs', store_in: 'Highlight +3 rides pack'
  };
  return map[active?.key] || '';
}

function resolveActiveOnboardingForScreen(state, screen) {
  const normalizedScreen = normalizeScreenName(screen);
  const backendActive = state?.activeOnboarding;
  if (backendActive && normalizeScreenName(backendActive.screen) === normalizedScreen) {
    return backendActive;
  }

  const statuses = state?.onboarding || {};
  const stateForResolution = {
    raceCount: Number.isFinite(Number(state?.raceCount)) ? Number(state.raceCount) : 0,
    xConnected: Boolean(state?.xConnected),
    gifts: state?.gifts || {}
  };

  const candidate = ONBOARDING_FALLBACK_FLOW.find((entry) => {
    if (entry.screen !== normalizedScreen) return false;
    const status = String(statuses[entry.key] || 'none').toLowerCase();
    return status === 'none' && entry.when(stateForResolution);
  });

  if (!candidate) return null;
  return {
    key: candidate.key,
    screen: candidate.screen,
    target: candidate.target,
    status: String(statuses[candidate.key] || 'none').toLowerCase(),
    hook: candidate.hook || '',
    rewardPreview: null
  };
}

async function sendEvent(action, active) {
  if (!active?.key) return;
  await postOnboardingEvent({ action, key: active.key, screen: normalizeScreenName(active.screen), target: active.target });
}

function normalizeScreenName(screen) {
  const normalized = String(screen || '').trim().toLowerCase();
  return SCREEN_ALIASES[normalized] || normalized || 'menu';
}

function showAuthorizedOnboarding(active) {
  const activeScreen = normalizeScreenName(active?.screen);
  if (!active || !AUTH_SCREENS.has(currentScreen) || activeScreen !== currentScreen) {
    logger.info('onboarding show skipped', { currentScreen, active });
    return;
  }
  const selector = TARGET_SELECTOR_MAP[active.target];
  if (!selector) { logger.warn('⚠️ onboarding target mapping missing', { target: active.target }); return; }
  logger.info('onboarding show attempt', { currentScreen, key: active.key, target: active.target, selector, status: active.status, raceCount: onboardingState.raceCount, xConnected: onboardingState.xConnected, backendActiveOnboarding: onboardingState.activeOnboarding, resolvedActiveOnboarding: active });

  const resolveVisibleTarget = (selectorInput) => {
    if (!selectorInput || typeof document === 'undefined') return null;
    const selectors = String(selectorInput).split(',').map((item) => item.trim()).filter(Boolean);
    for (const item of selectors) {
      const element = document.querySelector(item);
      if (!element) continue;
      const rect = element.getBoundingClientRect?.();
      const style = window.getComputedStyle?.(element);
      const isVisible = Boolean(rect && rect.width > 0 && rect.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none');
      if (isVisible) return { selector: item, element };
    }
    return null;
  };

  let attempts = 0;
  const render = () => {
    attempts += 1;
    const resolvedTarget = resolveVisibleTarget(selector);
    const spotlightTarget = resolvedTarget?.selector || selector;
    const shown = showSpotlight({
      target: spotlightTarget,
      text: getHookText(active),
      showSkip: true,
      onSkip: async () => { await sendEvent('skip', active); hideSpotlight(); },
      onTargetClick: async () => { await sendEvent('complete', active); hideSpotlight(); }
    });
    if (shown) {
      const sig = `${active.key}:${activeScreen}:${active.target}`;
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

  const active = resolveActiveOnboardingForScreen(onboardingState, currentScreen);
  const fallbackCandidate = ONBOARDING_FALLBACK_FLOW.find((entry) => {
    if (entry.screen !== currentScreen) return false;
    return entry.when({ raceCount: onboardingState.raceCount, xConnected: onboardingState.xConnected, gifts: onboardingState.gifts || {} });
  }) || null;
  const playAgainSelectorFound = Boolean(document.querySelector('#restartBtn, [data-action="restart-game"], .go-play-again, .play-again-btn'));
  const startBtnSelectorFound = Boolean(document.querySelector('#startBtn'));
  logger.info('onboarding second race debug', {
    currentScreen,
    normalizedRaceCount: onboardingState.raceCount,
    backendRaceCountFields: {
      raceCount: onboardingState.raceCount,
      completedRuns: onboardingState.completedRuns,
      finishedRuns: onboardingState.finishedRuns,
      runsCompleted: onboardingState.runsCompleted,
      onboardingRaceCount: onboardingState?.onboarding?.raceCount,
      onboardingCompletedRuns: onboardingState?.onboarding?.completedRuns
    },
    activeOnboarding: onboardingState.activeOnboarding,
    fallbackCandidate,
    playAgainSelectorFound,
    startBtnSelectorFound
  });
  logger.info('onboarding resolved active', {
    currentScreen,
    raceCount: onboardingState.raceCount,
    xConnected: onboardingState.xConnected,
    backendActiveOnboarding: onboardingState.activeOnboarding,
    resolvedActiveOnboarding: active,
    resolvedStatus: active?.key ? onboardingState.onboarding?.[active.key] : null,
    selector: active?.target ? TARGET_SELECTOR_MAP[active.target] : null
  });
  showAuthorizedOnboarding(active);
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
  currentScreen = normalizeScreenName(screen || currentScreen || 'menu');
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
