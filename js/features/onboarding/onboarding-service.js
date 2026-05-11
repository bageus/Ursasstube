import { buildBackendUrl } from '../../config.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_STORE_WRITE } from '../../request.js';
import { logger } from '../../logger.js';
import { normalizeOnboardingState } from './onboarding-state.js';
import { getPrimaryAuthIdentifier, getSigningWalletAddress } from '../auth/index.js';
import { getTelegramInitData } from '../../auth-telegram.js';

let onboardingStateInFlightPromise = null;
let onboardingStateCache = null;
let onboardingStateCacheIdentity = '';

function resetOnboardingStateCache({ clearIdentity = true } = {}) {
  onboardingStateCache = null;
  onboardingStateInFlightPromise = null;
  if (clearIdentity) onboardingStateCacheIdentity = '';
}

function buildOnboardingStateUrl(screen) {
  const base = buildBackendUrl('/api/onboarding/state');
  if (!screen) return base;
  return `${base}?screen=${encodeURIComponent(screen)}`;
}

function buildOnboardingAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const primaryId = getPrimaryAuthIdentifier();
  const wallet = getSigningWalletAddress();
  const telegramInitData = getTelegramInitData();
  if (primaryId) { headers['X-Primary-Id'] = String(primaryId); if (wallet) headers['X-Wallet'] = String(wallet); }
  if (telegramInitData) headers['X-Telegram-Init-Data'] = telegramInitData;
  return { headers, hasIdentity: Boolean(primaryId || telegramInitData) };
}

async function fetchOnboardingState({ screen = null } = {}) {
  const { headers, hasIdentity } = buildOnboardingAuthHeaders();
  const identityKey = JSON.stringify({ primaryId: headers['X-Primary-Id'] || '', wallet: headers['X-Wallet'] || '', telegram: headers['X-Telegram-Init-Data'] || '', screen: screen || '' });
  if (onboardingStateCacheIdentity !== identityKey) {
    resetOnboardingStateCache({ clearIdentity: false });
    onboardingStateCacheIdentity = identityKey;
  }
  if (onboardingStateCache) return onboardingStateCache;
  if (onboardingStateInFlightPromise) return onboardingStateInFlightPromise;
  if (!hasIdentity) return null;

  onboardingStateInFlightPromise = (async () => {
    try {
      const { ok, data } = await requestJsonResult(buildOnboardingStateUrl(screen), { ...REQUEST_PROFILE_LEADERBOARD_READ, retries: 0, headers });
      if (!ok) return null;
      const normalizedState = normalizeOnboardingState(data || {});
      logger.info('onboarding state response debug', {
        screen,
        raceCount: data?.raceCount,
        completedRuns: data?.completedRuns,
        finishedRuns: data?.finishedRuns,
        onboardingRaceCount: data?.onboarding?.raceCount,
        normalizedRaceCount: normalizedState?.raceCount,
        activeOnboarding: data?.activeOnboarding || null
      });
      onboardingStateCache = normalizedState;
      return normalizedState;
    } catch (error) {
      logger.warn('⚠️ onboarding state fetch failed', { error });
      return null;
    } finally { onboardingStateInFlightPromise = null; }
  })();
  return onboardingStateInFlightPromise;
}

async function postOnboardingEvent(payload) {
  try {
    const { ok } = await requestJsonResult(buildBackendUrl('/api/onboarding/event'), {
      ...REQUEST_PROFILE_STORE_WRITE,
      method: 'POST',
      headers: buildOnboardingAuthHeaders().headers,
      body: JSON.stringify(payload || {})
    });
    return Boolean(ok);
  } catch (error) {
    logger.warn('⚠️ onboarding event post failed', { payload, error });
    return false;
  }
}

export { fetchOnboardingState, postOnboardingEvent, resetOnboardingStateCache };
