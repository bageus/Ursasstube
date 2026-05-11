import { fetchOnboardingState } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { showMenuStartHook, hideMenuStartHook, showGameOverPlayAgainHook, clearGameOverOnboardingHook } from './hooks.js';
import { hideSpotlight, showSpotlight } from './spotlight.js';
import { mountGiftIndicator, unmountGiftIndicator, renderActiveBoostIndicators } from './gift-indicator.js';
import { logger } from '../../logger.js';
import { trackAnalyticsEvent } from '../../analytics.js';
import { hasAuthenticatedSession, isTelegramAuthMode, isTelegramMiniApp, getPrimaryAuthIdentifier } from '../auth/index.js';
import { BACKEND_URL } from '../../config.js';
import { requestJsonResult, REQUEST_PROFILE_STORE_WRITE } from '../../request.js';


const STEP = Object.freeze({
  AUTH_START: 'auth_start',
  AUTH_MENU: 'auth_menu',
  AUTH_RUN_1_DONE: 'auth_run_1_done',
  AUTH_RUN_2_DONE: 'auth_run_2_done',
  AUTH_RUN_3_DONE: 'auth_run_3_done',
  AFTER_FIRST_RUN: 'after_first_run',
  AFTER_SECOND_RUN: 'after_second_run',
  AFTER_THIRD_RUN: 'after_third_run',
  STORE_INTRO: 'store_intro',
  STORE_RIDE_PACK: 'store_ride_pack',
  STORE_BACK: 'store_back',
  COMPLETED: 'completed'
});

let onboardingState = { ...DEFAULT_ONBOARDING_STATE };
let currentScreen = 'menu';

const COMPLETED_EVENT_KEY = 'ursas.onboarding.completed.event.v1';
const WEB_GUEST_ONBOARDING_SEEN_KEY = 'ursas.webGuestOnboarding.seen.v1';
const skippedSteps = new Set();
let lastRuntimeMode = null;

function trackOnboardingStepEvent(eventName, extra = {}) {
  trackAnalyticsEvent(eventName, {
    onboarding_step: String(onboardingState.step || 'unknown'),
    ...extra
  });
}

function hideAllOnboardingUi() {
  hideMenuStartHook();
  clearGameOverOnboardingHook();
  hideSpotlight();
  unmountGiftIndicator();
  renderActiveBoostIndicators(onboardingState.activeBoosts || {});
}

function resolveMappedStep(step) {
  const normalized = String(step || '').trim().toLowerCase();
  return Object.values(STEP).includes(normalized) ? normalized : 'unknown';
}

function getGuestOnboardingStorage() {
  if (typeof window === 'undefined') return null;
  try {
    if (window.localStorage) return window.localStorage;
  } catch (_) {}
  try {
    if (window.sessionStorage) return window.sessionStorage;
  } catch (_) {}
  return null;
}

function readWebGuestOnboardingSeen() {
  const storage = getGuestOnboardingStorage();
  if (!storage) return false;
  return storage.getItem(WEB_GUEST_ONBOARDING_SEEN_KEY) === '1';
}

function writeWebGuestOnboardingSeen() {
  const storage = getGuestOnboardingStorage();
  if (!storage) return;
  storage.setItem(WEB_GUEST_ONBOARDING_SEEN_KEY, '1');
}

function resolveOnboardingRuntimeMode() {
  const telegramMiniApp = isTelegramMiniApp();
  const telegramInitData = String(window.Telegram?.WebApp?.initData || '').trim();
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  const hasAuthSession = hasAuthenticatedSession();

  if (telegramMiniApp) {
    if (hasAuthSession || isTelegramAuthMode() || getPrimaryAuthIdentifier()) return 'telegram_authenticated';
    if (telegramInitData || telegramUser) return 'telegram_auth_pending';
    return 'telegram_auth_failed';
  }

  if (hasAuthSession) return 'web_authenticated';
  if (!readWebGuestOnboardingSeen()) return 'web_guest_first_visit';
  return 'web_guest';
}

function showSpotlightBySelector({ selector, text = '', showSkip = true } = {}) {
  const maxAttempts = 10;
  let attempts = 0;
  const step = resolveMappedStep(onboardingState.step);

  const render = () => {
    attempts += 1;
    const shown = showSpotlight({
      target: selector,
      text,
      showSkip,
      onSkip: () => {
        skippedSteps.add(resolveMappedStep(onboardingState.step));
        trackOnboardingStepEvent('onboarding_step_skipped');
      },
      onTargetClick: () => {
        trackOnboardingStepEvent('onboarding_step_clicked', { target: selector });
      },
      step
    });

    if (shown || attempts >= maxAttempts) {
      if (!shown) logger.warn('⚠️ onboarding spotlight target not found', { step, selector, attempts });
      return shown;
    }

    requestAnimationFrame(() => {
      setTimeout(render, 50);
    });
    return false;
  };

  return render();
}


function getPendingRadarGift() {
  const gifts = onboardingState.gifts || {};
  if (gifts.radar_obstacles_24h?.unlocked && !gifts.radar_obstacles_24h?.claimed) return 'radar_obstacles_24h';
  if (gifts.radar_gold_24h?.unlocked && !gifts.radar_gold_24h?.claimed) return 'radar_gold_24h';
  return null;
}

async function claimOnboardingGift(reward) {
  const url = `${String(BACKEND_URL || '').trim()}/api/onboarding/claim`;
  const { ok } = await requestJsonResult(url, {
    ...REQUEST_PROFILE_STORE_WRITE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reward })
  });
  if (ok) {
    await refreshOnboardingState({ reason: 'onboarding_claim' });
    window.dispatchEvent(new CustomEvent('ursas:onboarding-store-buy', { detail: { reward } }));
  }
}

function applyRadarGiftStoreCard(giftKey) {
  const map = { radar_obstacles_24h: '#store-radarobstacles-0', radar_gold_24h: '#store-radargold-0' };
  const selector = map[giftKey];
  if (!selector) return;
  const card = document.querySelector(selector);
  if (!card) return;
  const priceEl = card.querySelector('.store-tier-price');
  if (priceEl) priceEl.textContent = 'FREE 24H';
  card.onclick = () => claimOnboardingGift(giftKey);
  if (!skippedSteps.has(`gift_store_${giftKey}`)) {
    showSpotlight({ target: selector, text: '', showSkip: true, onSkip: () => skippedSteps.add(`gift_store_${giftKey}`) });
  }
}

function trackOnboardingCompletedOnce() {
  if (!onboardingState.completed) return;
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(COMPLETED_EVENT_KEY) === '1') return;
  trackOnboardingStepEvent('onboarding_completed', { onboarding_step: String(onboardingState.step || STEP.COMPLETED) });
  sessionStorage.setItem(COMPLETED_EVENT_KEY, '1');
}

function applyOnboardingUiState() {
  hideAllOnboardingUi();

  const runtimeMode = resolveOnboardingRuntimeMode();
  lastRuntimeMode = runtimeMode;

  const step = resolveMappedStep(onboardingState.step);
  if (onboardingState.completed || step === STEP.COMPLETED) {
    trackOnboardingCompletedOnce();
    return;
  }

  if (runtimeMode === 'telegram_auth_pending') return;
  if (runtimeMode === 'telegram_auth_failed') {
    logger.warn('⚠️ Telegram auth failed; onboarding waiting for auth retry');
    return;
  }

  if (runtimeMode === 'web_guest_first_visit') {
    showSpotlight({
      target: '#startBtn',
      text: 'Start your first run',
      showSkip: true,
      onSkip: () => {
        writeWebGuestOnboardingSeen();
        hideSpotlight();
        trackOnboardingStepEvent('onboarding_guest_skipped');
      },
      onTargetClick: () => {
        writeWebGuestOnboardingSeen();
        trackOnboardingStepEvent('onboarding_step_clicked', { target: '#startBtn', flow: 'web_guest' });
      },
      step: 'guest_start'
    }) || showSpotlightBySelector({ selector: '#startBtn', text: 'Start your first run', showSkip: true });
    return;
  }

  if (step === 'unknown') return;
  if (skippedSteps.has(step)) return;

  trackOnboardingStepEvent('onboarding_step_shown', { presentation: step, screen: currentScreen });

  if ((step === STEP.AUTH_START || step === STEP.AUTH_MENU) && currentScreen === 'menu') {
    showMenuStartHook('Take the lead');
    return;
  }
  if ((step === STEP.AUTH_RUN_1_DONE || step === STEP.AFTER_FIRST_RUN) && currentScreen === 'game-over') {
    showGameOverPlayAgainHook('Run again. Get +100 silver');
    return;
  }
  if ((step === STEP.AUTH_RUN_2_DONE || step === STEP.AFTER_SECOND_RUN) && currentScreen === 'game-over') {
    showGameOverPlayAgainHook('One more run. Get +100 gold');
    return;
  }
  if ((step === STEP.AUTH_RUN_3_DONE || step === STEP.AFTER_THIRD_RUN) && currentScreen === 'game-over') {
    showGameOverPlayAgainHook('Connect X for more rewards');
    return;
  }
  const pendingGift = getPendingRadarGift();
  if (pendingGift && currentScreen === 'menu') {
    const skippedGiftMenu = skippedSteps.has(`gift_menu_${pendingGift}`);
    if (!skippedGiftMenu) {
      showSpotlight({ target: '#storeBtn', text: 'Claim your free Radar', showSkip: true, onSkip: () => skippedSteps.add(`gift_menu_${pendingGift}`), onTargetClick: () => { trackOnboardingStepEvent('onboarding_step_clicked', { target: '#storeBtn', flow: 'radar_gift_menu' }); } });
    } else {
      mountGiftIndicator({ onClick: () => document.querySelector('#storeBtn')?.click?.() });
    }
    return;
  }
  if (pendingGift && currentScreen === 'store') {
    applyRadarGiftStoreCard(pendingGift);
    return;
  }

  if (step === STEP.STORE_INTRO && currentScreen === 'menu') {
    showSpotlightBySelector({ selector: '#storeBtn', text: 'Upgrade your runs', showSkip: true });
    return;
  }
  if (step === STEP.STORE_RIDE_PACK && currentScreen === 'store') {
    showSpotlightBySelector({ selector: '#store-ride-pack-3', text: '', showSkip: true });
    return;
  }
  if (step === STEP.STORE_BACK) {
    if (currentScreen === 'store') {
      showSpotlightBySelector({ selector: '#storeBackBtn', text: '', showSkip: true });
      return;
    }
    if (currentScreen === 'menu') {
      showSpotlightBySelector({ selector: '#startBtn', text: 'You’re ready. Start again.', showSkip: false });
    }
  }
}

async function refreshOnboardingState({ reason = 'manual' } = {}) {
  const remote = await fetchOnboardingState();
  if (remote) onboardingState = writeCachedOnboardingState(remote);
  applyOnboardingUiState();
  logger.info('🧭 Onboarding refreshed', { reason, step: onboardingState.step, completed: onboardingState.completed, screen: currentScreen });
  return { ...onboardingState };
}

function applyOnboardingForScreen(screen) {
  currentScreen = String(screen || currentScreen || 'menu');
  applyOnboardingUiState();
}

async function initOnboardingFeature() {
  onboardingState = readCachedOnboardingState();
  await refreshOnboardingState({ reason: 'init' });
  logger.info('🧭 Onboarding initialized', { step: onboardingState.step, completed: onboardingState.completed });
  return { ...onboardingState };
}

export { initOnboardingFeature, refreshOnboardingState, applyOnboardingForScreen };
