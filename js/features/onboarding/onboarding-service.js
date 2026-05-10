import { BACKEND_URL } from '../../config.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ } from '../../request.js';
import { logger } from '../../logger.js';
import { normalizeOnboardingState } from './onboarding-state.js';

function buildOnboardingStateUrl() {
  const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost';
  return new URL(`${String(BACKEND_URL || '').trim()}/api/onboarding/state`, origin).toString();
}

async function fetchOnboardingState() {
  try {
    const { ok, data } = await requestJsonResult(buildOnboardingStateUrl(), REQUEST_PROFILE_LEADERBOARD_READ);
    if (!ok) return null;
    return normalizeOnboardingState(data?.onboarding || data);
  } catch (error) {
    logger.warn('⚠️ onboarding state fetch failed', error);
    return null;
  }
}

export { fetchOnboardingState };
