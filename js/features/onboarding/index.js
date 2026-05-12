import { fetchOnboardingState, postOnboardingEvent, resetOnboardingStateCache } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { hideSpotlight, showSpotlight } from './spotlight.js';
import { hideMenuStartHook, clearGameOverOnboardingHook } from './hooks.js';
import { mountGiftIndicator, mountBoostIndicator, unmountGiftIndicator, renderActiveBoostIndicators } from './gift-indicator.js';
import { logger } from '../../logger.js';
import { hasAuthenticatedSession, isTelegramMiniApp } from '../auth/index.js';
import { hasRideLimit } from '../store/index.js';
import { getPlayerRides } from '../../store/rides-service.js';

const WEB_GUEST_ONBOARDING_DISMISSED_KEY = 'ursas.guest.onboarding.dismissed.v1';
const AUTH_SCREENS = new Set(['menu', 'game-over', 'store', 'player-menu']);

const SCREEN_ALIASES = Object.freeze({
  main: 'menu',
  home: 'menu',
  gameover: 'game-over'
});

let onboardingState = { ...DEFAULT_ONBOARDING_STATE };
let currentScreen = 'menu';
let lastShownSignature = '';
const dismissedOnboardingSteps = new Set();
const pendingSkipSteps = new Set();

const TARGET_SELECTOR_MAP = Object.freeze({
  start_game: '#startBtn',
  play_again: '#restartBtn, [data-action="restart-game"], .go-play-again, .play-again-btn',
  connect_x_or_share_result: '#shareResultBtn',
  player_menu_connect_x: '#pmShareBtn',
  store_button: '#storeBtn',
  store_back: '#storeBackBtn',
  ride_pack_3: '#store-ride-pack-3',
  radar_obstacles_24h_card: '#store-radarobstacles-0',
  radar_gold_24h_card: '#store-radargold-0',
  radar_obstacles_card: '#store-radarobstacles-0',
  radar_gold_card: '#store-radargold-0'
});

const ONBOARDING_ALLOWED_TARGETS = Object.freeze({
  first_race: { screen: 'menu', target: 'start_game' },
  second_race_game_over: { screen: 'game-over', target: 'play_again' },
  second_race_menu: { screen: 'menu', target: 'start_game' },
  third_race_game_over: { screen: 'game-over', target: 'play_again' },
  third_race_menu: { screen: 'menu', target: 'start_game' },
  share_result_game_over: { screen: 'game-over', target: 'connect_x_or_share_result' },
  share_result_player_menu: { screen: 'player-menu', target: 'player_menu_connect_x' },
  store_start: { screen: 'menu', target: 'store_button' },
  store_in: { screen: 'store', target: 'ride_pack_3' },
  gift_radar_obstacles_store: { screen: 'store', target: 'radar_obstacles_24h_card' },
  gift_radar_gold_store: { screen: 'store', target: 'radar_gold_24h_card' }
});

const ONBOARDING_FALLBACK_FLOW = [
  { key: 'first_race', screen: 'menu', target: 'start_game', when: (state) => state.raceCount === 0 },
  { key: 'second_race_game_over', screen: 'game-over', target: 'play_again', hook: 'Play again and get +100 silver', when: (state) => state.raceCount === 1 },
  { key: 'second_race_menu', screen: 'menu', target: 'start_game', hook: 'Play again and get +100 silver', when: (state) => state.raceCount === 1 },
  { key: 'third_race_game_over', screen: 'game-over', target: 'play_again', hook: 'Play again and get +100 gold', when: (state) => state.raceCount === 2 },
  { key: 'third_race_menu', screen: 'menu', target: 'start_game', hook: 'Play again and get +100 gold', when: (state) => state.raceCount === 2 },
  { key: 'share_result_game_over', screen: 'game-over', target: 'connect_x_or_share_result', when: (state) => state.raceCount >= 3 && !state.xConnected },
  { key: 'share_result_player_menu', screen: 'player-menu', target: 'player_menu_connect_x', when: (state) => state.raceCount >= 3 && !state.xConnected },
  { key: 'store_start', screen: 'menu', target: 'store_button', when: (state) => state.raceCount >= 3 },
  { key: 'store_in', screen: 'store', target: 'ride_pack_3', when: (state) => state.raceCount >= 3 },
  { key: 'gift_radar_obstacles_store', screen: 'store', target: 'radar_obstacles_24h_card', when: (state) => state.gifts?.radar_obstacles_24h?.available },
  { key: 'gift_radar_gold_store', screen: 'store', target: 'radar_gold_24h_card', when: (state) => state.gifts?.radar_gold_24h?.available }
];

function isAuthorizedRuntime() {
  return isTelegramMiniApp() || hasAuthenticatedSession();
}
function getStorage() { try { return window.localStorage || null; } catch (_) { return null; } }
function readGuestDismissed() { return getStorage()?.getItem(WEB_GUEST_ONBOARDING_DISMISSED_KEY) === '1'; }
function writeGuestDismissed() { getStorage()?.setItem(WEB_GUEST_ONBOARDING_DISMISSED_KEY, '1'); }

function getOnboardingStatus(key) {
  return String(onboardingState?.onboarding?.[key] || 'none').toLowerCase();
}

function isStepBlocked(key, status = null) {
  const normalized = String(status || getOnboardingStatus(key) || 'none').toLowerCase();
  return ['skip', 'skipped', 'complete', 'completed'].includes(normalized);
}

function isLocallyDismissedStep(key) {
  if (!key) return false;
  return dismissedOnboardingSteps.has(String(key)) || pendingSkipSteps.has(String(key));
}

function isOnboardingUiBlocked() {
  if (typeof document === 'undefined') return true;
  const body = document.body;
  if (!AUTH_SCREENS.has(currentScreen)) return true;

  if (body?.classList?.contains('preload-active')) return true;
  if (body?.classList?.contains('loading-ui')) return true;
  if (body?.classList?.contains('start-launching')) return true;

  const darkScreen = document.getElementById('darkScreen');
  if (darkScreen) {
    const style = window.getComputedStyle(darkScreen);
    const rect = darkScreen.getBoundingClientRect();
    const visible = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0
      && rect.width > 0
      && rect.height > 0;
    if (visible) return true;
  }

  const loadingContainers = [
    '#gameContainer',
    '#rendererPlaceholder',
    '#renderer-placeholder',
    '[data-renderer-placeholder]'
  ];
  for (const selector of loadingContainers) {
    const el = document.querySelector(selector);
    if (!el) continue;
    if (el.classList?.contains('preparing') || el.classList?.contains('loading') || el.classList?.contains('is-preparing') || el.classList?.contains('is-loading')) {
      return true;
    }
  }

  return false;
}


function getHookText(active) {
  if (active?.hook) return String(active.hook);
  const map = {
    first_race: 'Take the lead / Start your first race',
    second_race_game_over: 'Play again and get +100 silver', second_race_menu: 'Play again and get +100 silver',
    third_race_game_over: 'Play again and get +100 gold', third_race_menu: 'Play again and get +100 gold',
    share_result_game_over: 'Share your result and get a bonus', share_result_player_menu: 'Connect X and get a bonus',
    store_start: 'Open Store to upgrade your runs', store_in: 'Highlight +3 rides pack'
  };
  return map[active?.key] || '';
}

function isSharePromptText(text) {
  const normalized = String(text || '').toLowerCase();
  return normalized.includes('connect x') || normalized.includes('share your result');
}

function validateActiveOnboarding(active, screenOverride = null) {
  if (!active) return null;
  const key = String(active.key || '');
  const normalizedScreen = normalizeScreenName(screenOverride || active.screen);
  const target = String(active.target || '');
  const expected = ONBOARDING_ALLOWED_TARGETS[key];
  const hookText = getHookText(active);

  const targetAliases = {
    radar_obstacles_24h_card: new Set(['radar_obstacles_24h_card', 'radar_obstacles_card']),
    radar_gold_24h_card: new Set(['radar_gold_24h_card', 'radar_gold_card'])
  };
  const allowedTargets = targetAliases[expected?.target] || new Set([expected?.target]);

  if (!expected || expected.screen !== normalizedScreen || !allowedTargets.has(target)) {
    logger.warn('⚠️ onboarding allowlist rejected active onboarding', { active, normalizedScreen });
    return null;
  }
  if (target === 'player_menu_connect_x' && normalizedScreen !== 'player-menu') {
    logger.warn('⚠️ onboarding blocked player menu share target outside player-menu', { active, normalizedScreen });
    return null;
  }
  if (target === 'connect_x_or_share_result' && normalizedScreen !== 'game-over') {
    logger.warn('⚠️ onboarding blocked game-over share target outside game-over', { active, normalizedScreen });
    return null;
  }
  if (isSharePromptText(hookText) && normalizedScreen !== 'game-over' && normalizedScreen !== 'player-menu') {
    logger.warn('⚠️ onboarding blocked share/connect hook text outside allowed screens', { active, normalizedScreen, hookText });
    return null;
  }

  return { ...active, screen: normalizedScreen };
}


function shouldSuppressRaceStartOnboarding(active) {
  if (!active?.target) return false;
  if (active.target !== 'start_game' && active.target !== 'play_again') return false;

  if (!hasRideLimit()) return false;

  const rides = getPlayerRides();
  const totalRides = Number(rides?.totalRides || 0);
  if (totalRides > 0) return false;

  logger.info('onboarding suppressed: no rides', {
    key: active?.key || null,
    target: active.target,
    totalRides
  });
  return true;
}

function resolveActiveOnboardingForScreen(state, screen) {
  const normalizedScreen = normalizeScreenName(screen);
  const backendActive = state?.activeOnboarding;
  if (backendActive) {
    if (isStepBlocked(backendActive.key, backendActive.status) || isLocallyDismissedStep(backendActive.key)) {
      return null;
    }
    const validatedBackend = validateActiveOnboarding(backendActive, backendActive.screen);
    if (validatedBackend && validatedBackend.screen === normalizedScreen) {
      return validatedBackend;
    }
  }

  const statuses = state?.onboarding || {};
  const stateForResolution = {
    raceCount: Number.isFinite(Number(state?.raceCount)) ? Number(state.raceCount) : 0,
    xConnected: Boolean(state?.xConnected),
    gifts: state?.gifts || {}
  };

  const candidate = ONBOARDING_FALLBACK_FLOW.find((entry) => {
    if (entry.screen !== normalizedScreen) return false;
    const status = getOnboardingStatus(entry.key);
    return !isLocallyDismissedStep(entry.key) && !isStepBlocked(entry.key, status) && status === 'none' && entry.when(stateForResolution);
  });

  if (!candidate) return null;
  return validateActiveOnboarding({
    key: candidate.key,
    screen: candidate.screen,
    target: candidate.target,
    status: String(statuses[candidate.key] || 'none').toLowerCase(),
    hook: candidate.hook || '',
    rewardPreview: null
  }, candidate.screen);
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
  if (isOnboardingUiBlocked()) {
    hideSpotlight();
    clearGameOverOnboardingHook();
    return;
  }
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

  const waitForLayoutStability = async () => {
    if (typeof window === 'undefined') return;
    if (currentScreen !== 'game-over') return;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(120);

    let prevSignature = '';
    let stableFrames = 0;
    for (let i = 0; i < 16; i += 1) {
      await wait(50);
      const resolved = resolveVisibleTarget(selector);
      const el = resolved?.element;
      if (!el) {
        stableFrames = 0;
        prevSignature = '';
        continue;
      }
      const rect = el.getBoundingClientRect();
      const signature = `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
      if (signature === prevSignature) stableFrames += 1;
      else {
        prevSignature = signature;
        stableFrames = 1;
      }
      if (stableFrames >= 3) break;
    }
  };

  let attempts = 0;
  const render = async () => {
    attempts += 1;
    if (isOnboardingUiBlocked()) {
      hideSpotlight();
      clearGameOverOnboardingHook();
      return;
    }
    const resolvedTarget = resolveVisibleTarget(selector);
    const spotlightTarget = resolvedTarget?.selector || selector;
    if (isOnboardingUiBlocked()) {
      hideSpotlight();
      clearGameOverOnboardingHook();
      return;
    }
    const shown = await showSpotlight({
      target: spotlightTarget,
      text: getHookText(active),
      showSkip: true,
      onSkip: async () => {
        const stepKey = String(active.key || '');
        if (stepKey) {
          dismissedOnboardingSteps.add(stepKey);
          pendingSkipSteps.add(stepKey);
        }

        hideSpotlight();
        clearGameOverOnboardingHook();

        onboardingState = writeCachedOnboardingState({
          ...onboardingState,
          onboarding: { ...(onboardingState.onboarding || {}), [active.key]: 'skip' },
          activeOnboarding: null
        });
        applyOnboardingUiState();

        await sendEvent('skip', active);
        await refreshOnboardingState({ reason: `skip_${active.key}`, screen: currentScreen });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ursas:onboarding-spotlight-skipped', { detail: { key: active.key, screen: currentScreen } }));
        }
      },
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
    if (isOnboardingUiBlocked()) {
      hideSpotlight();
      clearGameOverOnboardingHook();
      return;
    }
    requestAnimationFrame(() => setTimeout(() => {
      render().catch(() => {});
    }, 50));
  };
  waitForLayoutStability().finally(() => {
    render().catch(() => {});
  });
}

function applyOnboardingUiState() {
  hideMenuStartHook();
  clearGameOverOnboardingHook();
  hideSpotlight();
  unmountGiftIndicator();
  renderActiveBoostIndicators(onboardingState.activeBoosts || {});

  if (isOnboardingUiBlocked()) {
    logger.info('onboarding show skipped while ui blocked', { currentScreen });
    return;
  }

  if (!isAuthorizedRuntime()) {
    if (isTelegramMiniApp()) return;
    if (readGuestDismissed()) return;
    showSpotlight({
      target: '#startBtn', text: 'Start your first run', showSkip: true,
      onSkip: () => { writeGuestDismissed(); hideSpotlight(); },
      onTargetClick: () => { writeGuestDismissed(); hideSpotlight(); }
    }).catch(() => {});
    return;
  }

  const gifts = onboardingState.gifts || {};
  const boosts = onboardingState.activeBoosts || {};
  const hasGiftAvailable = Boolean(gifts.radar_obstacles_24h?.available || gifts.radar_gold_24h?.available);
  if (currentScreen === 'menu') {
    if (Object.keys(boosts).length > 0) mountBoostIndicator(boosts);
    else if (hasGiftAvailable) mountGiftIndicator({ onClick: () => document.querySelector('#storeBtn')?.click?.() });
  }

  const active = resolveActiveOnboardingForScreen(onboardingState, currentScreen);
  if (shouldSuppressRaceStartOnboarding(active)) {
    return;
  }

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
  else onboardingState = writeCachedOnboardingState({ ...DEFAULT_ONBOARDING_STATE, activeBoosts: onboardingState.activeBoosts || DEFAULT_ONBOARDING_STATE.activeBoosts });

  for (const stepKey of [...pendingSkipSteps]) {
    const status = String(onboardingState?.onboarding?.[stepKey] || '').toLowerCase();
    const backendSettled = ['skip', 'skipped', 'complete', 'completed'].includes(status)
      || String(onboardingState?.activeOnboarding?.key || '') !== stepKey;
    if (backendSettled) pendingSkipSteps.delete(stepKey);
  }
  applyOnboardingUiState();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ursas:onboarding-state-updated', {
      detail: { reason, screen: screen || currentScreen, state: { ...onboardingState } }
    }));
  }
  return { ...onboardingState };
}

function applyOnboardingForScreen(screen) {
  currentScreen = normalizeScreenName(screen || currentScreen || 'menu');
  if (isAuthorizedRuntime() && AUTH_SCREENS.has(currentScreen)) {
    refreshOnboardingState({ reason: `screen_${currentScreen}`, screen: currentScreen }).catch(() => {
      onboardingState = { ...onboardingState, activeOnboarding: null };
      applyOnboardingUiState();
    });
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

async function postOnboardingAction({ action, key, screen, target }) {
  if (!action || !key) return;
  await postOnboardingEvent({ action, key, screen: normalizeScreenName(screen), target });
}

function getOnboardingStateSnapshot() {
  return { ...onboardingState, gifts: { ...(onboardingState.gifts || {}) } };
}

async function completeStoreInOnboardingFromPurchase() {
  onboardingState = writeCachedOnboardingState({
    ...onboardingState,
    onboarding: { ...(onboardingState.onboarding || {}), store_in: 'complete' },
    activeOnboarding: null
  });
  hideSpotlight();
  resetOnboardingStateCache();
  await refreshOnboardingState({ reason: 'store_in_complete', screen: 'store', resetCache: true });
}

export { initOnboardingFeature, refreshOnboardingState, applyOnboardingForScreen, dismissGuestOnboardingOnWalletConnect, postOnboardingAction, getOnboardingStateSnapshot, completeStoreInOnboardingFromPurchase };
