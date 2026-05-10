import { fetchOnboardingState } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { showMenuStartHook, hideMenuStartHook, showGameOverPlayAgainHook } from './hooks.js';
import { mountGiftIndicator, unmountGiftIndicator } from './gift-indicator.js';
import { showStore } from '../../ui.js';
import { logger } from '../../logger.js';
import { trackAnalyticsEvent } from '../../analytics.js';

let onboardingState = { ...DEFAULT_ONBOARDING_STATE };


const COMPLETED_EVENT_KEY = 'ursas.onboarding.completed.event.v1';

function trackOnboardingCompletedOnce() {
  if (!onboardingState.completed) return;
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(COMPLETED_EVENT_KEY) === '1') return;
  trackOnboardingStepEvent('onboarding_completed', {
    onboarding_step: String(onboardingState.step || 'completed')
  });
  sessionStorage.setItem(COMPLETED_EVENT_KEY, '1');
}

function getOnboardingStateSnapshot() {
  return { ...onboardingState };
}


function trackOnboardingStepEvent(eventName, extra = {}) {
  trackAnalyticsEvent(eventName, {
    onboarding_step: String(onboardingState.step || 'unknown'),
    ...extra
  });
}

function resolveUiActionByStep(step) {
  const normalizedStep = String(step || '').toLowerCase();
  if (normalizedStep.includes('auth_menu') || normalizedStep.includes('start') || normalizedStep === 'step_1') {
    return { type: 'menu_hook', text: 'Take the lead' };
  }
  if (normalizedStep.includes('after_first_run') || normalizedStep === 'step_2') {
    return { type: 'game_over_hook', text: 'Run again. Get +100 silver' };
  }
  if (normalizedStep.includes('after_second_run') || normalizedStep === 'step_3') {
    return { type: 'game_over_hook', text: 'One more run. Get +100 gold' };
  }
  if (normalizedStep.includes('after_third_run') || normalizedStep === 'step_4') {
    return { type: 'game_over_hook', text: 'Connect X for more rewards' };
  }
  if (normalizedStep.includes('radar') || normalizedStep.includes('gift') || normalizedStep === 'step_5') {
    return { type: 'radar_gift' };
  }
  return { type: 'none' };
}

function applyOnboardingUiState() {
  const action = resolveUiActionByStep(onboardingState.step);
  if (onboardingState.completed || action.type === 'none') {
    hideMenuStartHook();
    unmountGiftIndicator();
    trackOnboardingCompletedOnce();
    return;
  }

  trackOnboardingStepEvent('onboarding_step_shown', {
    presentation: action.type
  });

  if (action.type === 'menu_hook') {
    unmountGiftIndicator();
    showMenuStartHook(action.text);
    return;
  }


  if (action.type === 'radar_gift') {
    hideMenuStartHook();
    mountGiftIndicator({
      label: '🎁 FREE RADAR',
      onClick: () => {
        trackOnboardingStepEvent('onboarding_step_clicked', { target: 'gift_indicator' });
        trackOnboardingStepEvent('radar_gift_prompt_shown', { source: 'gift_indicator_click' });
        showStore();
      }
    });
    return;
  }

  hideMenuStartHook();
  if (action.type === 'game_over_hook') {
    showGameOverPlayAgainHook(action.text);
  }
}

async function initOnboardingFeature() {
  onboardingState = readCachedOnboardingState();
  const remote = await fetchOnboardingState();
  if (remote) {
    onboardingState = writeCachedOnboardingState(remote);
  }

  applyOnboardingUiState();

  logger.info('🧭 Onboarding initialized', {
    step: onboardingState.step,
    completed: onboardingState.completed
  });
  return getOnboardingStateSnapshot();
}

export { initOnboardingFeature };
