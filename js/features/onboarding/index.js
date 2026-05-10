import { fetchOnboardingState } from './onboarding-service.js';
import { DEFAULT_ONBOARDING_STATE, readCachedOnboardingState, writeCachedOnboardingState } from './onboarding-state.js';
import { logger } from '../../logger.js';

let onboardingState = { ...DEFAULT_ONBOARDING_STATE };

function getOnboardingStateSnapshot() {
  return { ...onboardingState };
}

async function initOnboardingFeature() {
  onboardingState = readCachedOnboardingState();
  const remote = await fetchOnboardingState();
  if (remote) {
    onboardingState = writeCachedOnboardingState(remote);
  }
  logger.info('🧭 Onboarding initialized', {
    step: onboardingState.step,
    completed: onboardingState.completed
  });
  return getOnboardingStateSnapshot();
}

export { initOnboardingFeature };
