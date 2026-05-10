import { BACKEND_URL } from '../../config.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_STORE_WRITE } from '../../request.js';
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

async function postOnboardingEvent(eventName) {
  const normalizedEventName = String(eventName || '').trim();
  if (!normalizedEventName) return false;

  try {
    const { ok } = await requestJsonResult(buildOnboardingStateUrl().replace('/state', '/event'), {
      ...REQUEST_PROFILE_STORE_WRITE,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: normalizedEventName })
    });
    return Boolean(ok);
  } catch (error) {
    logger.warn('⚠️ onboarding event post failed', { event: normalizedEventName, error });
    return false;
  }
}

export { fetchOnboardingState, postOnboardingEvent };
