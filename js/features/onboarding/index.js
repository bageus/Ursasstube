import { fetchOnboardingState } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { showMenuStartHook, hideMenuStartHook, showGameOverPlayAgainHook, clearGameOverOnboardingHook } from './hooks.js';
import { hideSpotlight, showSpotlight } from './spotlight.js';
import { unmountGiftIndicator } from './gift-indicator.js';
import { logger } from '../../logger.js';
import { trackAnalyticsEvent } from '../../analytics.js';
import { hasAuthenticatedSession } from '../auth/index.js';

const STEP = Object.freeze({
  AUTH_START: 'auth_start',
  AUTH_MENU: 'auth_menu',
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
const skippedSteps = new Set();

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
}

function resolveMappedStep(step) {
  const normalized = String(step || '').trim().toLowerCase();
  return Object.values(STEP).includes(normalized) ? normalized : 'unknown';
}

function shouldHideForGuest() {
  return !hasAuthenticatedSession();
}

function showSpotlightBySelector({ selector, text = '', showSkip = true } = {}) {
  const target = document.querySelector(selector);
  if (!target) return false;
  return showSpotlight({
    target,
    text,
    showSkip,
    onSkip: () => {
      skippedSteps.add(resolveMappedStep(onboardingState.step));
      trackOnboardingStepEvent('onboarding_step_skipped');
    },
    onTargetClick: () => {
      trackOnboardingStepEvent('onboarding_step_clicked', { target: selector });
      target.click?.();
    }
  });
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

  const step = resolveMappedStep(onboardingState.step);
  if (onboardingState.completed || step === STEP.COMPLETED || step === 'unknown' || shouldHideForGuest()) {
    trackOnboardingCompletedOnce();
    return;
  }
  if (skippedSteps.has(step)) return;

  trackOnboardingStepEvent('onboarding_step_shown', { presentation: step, screen: currentScreen });

  if ((step === STEP.AUTH_START || step === STEP.AUTH_MENU) && currentScreen === 'menu') {
    showMenuStartHook('Take the lead');
    return;
  }
  if (step === STEP.AFTER_FIRST_RUN && currentScreen === 'game-over') {
    showGameOverPlayAgainHook('Run again. Get +100 silver');
    return;
  }
  if (step === STEP.AFTER_SECOND_RUN && currentScreen === 'game-over') {
    showGameOverPlayAgainHook('One more run. Get +100 gold');
    return;
  }
  if (step === STEP.AFTER_THIRD_RUN && currentScreen === 'game-over') {
    showGameOverPlayAgainHook('Connect X for more rewards');
    return;
  }
  if (step === STEP.STORE_INTRO && currentScreen === 'menu') {
    showSpotlightBySelector({ selector: '#storeBtn', text: 'Upgrade your runs', showSkip: true });
    return;
  }
  if (step === STEP.STORE_RIDE_PACK && currentScreen === 'store') {
    showSpotlightBySelector({ selector: '#store-ride-pack-3, #store-rides_pack', text: '', showSkip: true });
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
