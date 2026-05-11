import { buildBackendUrl } from '../../config.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_STORE_WRITE } from '../../request.js';
import { logger } from '../../logger.js';
import { normalizeOnboardingState } from './onboarding-state.js';
import { getPrimaryAuthIdentifier, getSigningWalletAddress } from '../auth/index.js';
import { getTelegramInitData } from '../../auth-telegram.js';

let onboardingStateInFlightPromise = null;
let onboardingStateCache = null;
let onboardingStateCacheIdentity = '';
let hasLoggedMissingIdentity = false;

function resetOnboardingStateCache({ clearIdentity = true } = {}) {
  onboardingStateCache = null;
  onboardingStateInFlightPromise = null;
  if (clearIdentity) onboardingStateCacheIdentity = '';
}

function buildOnboardingStateUrl() {
  return buildBackendUrl('/api/onboarding/state');
}

function buildOnboardingAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const primaryId = getPrimaryAuthIdentifier();
  const wallet = getSigningWalletAddress();
  const telegramInitData = getTelegramInitData();

  if (primaryId) {
    headers['X-Primary-Id'] = String(primaryId);
    if (wallet) headers['X-Wallet'] = String(wallet);
  }
  if (telegramInitData) {
    headers['X-Telegram-Init-Data'] = telegramInitData;
  }

  return { headers, hasIdentity: Boolean(primaryId || telegramInitData) };
}

async function fetchOnboardingState() {
  const { headers, hasIdentity } = buildOnboardingAuthHeaders();
  const identityKey = JSON.stringify({
    primaryId: headers['X-Primary-Id'] || '',
    wallet: headers['X-Wallet'] || '',
    telegram: headers['X-Telegram-Init-Data'] || ''
  });

  if (onboardingStateCacheIdentity !== identityKey) {
    resetOnboardingStateCache({ clearIdentity: false });
    onboardingStateCacheIdentity = identityKey;
  }

  if (onboardingStateCache) return onboardingStateCache;
  if (onboardingStateInFlightPromise) return onboardingStateInFlightPromise;

  const shouldFetchRemote = hasIdentity;
  if (!shouldFetchRemote) {
    if (!hasLoggedMissingIdentity) {
      hasLoggedMissingIdentity = true;
      logger.info('🧭 onboarding state: skip remote fetch (user identity unavailable)');
    }
    resetOnboardingStateCache({ clearIdentity: false });
    return null;
  }

  onboardingStateInFlightPromise = (async () => {
    try {
      const { ok, status, data } = await requestJsonResult(buildOnboardingStateUrl(), {
        ...REQUEST_PROFILE_LEADERBOARD_READ,
        retries: 0,
        headers
      });

      if (!ok) {
        if (status === 400) {
          logger.info('🧭 onboarding state: backend returned 400, using local fallback');
          resetOnboardingStateCache({ clearIdentity: false });
          return null;
        }
        return null;
      }

      const normalizedState = normalizeOnboardingState(data?.onboarding || data);
      onboardingStateCache = normalizedState;
      return normalizedState;
    } catch (_error) {
      logger.info('🧭 onboarding state fetch failed, using local fallback');
      resetOnboardingStateCache({ clearIdentity: false });
      return null;
    } finally {
      onboardingStateInFlightPromise = null;
    }
  })();

  return onboardingStateInFlightPromise;
}

async function postOnboardingEvent(eventName) {
  const normalizedEventName = String(eventName || '').trim();
  if (!normalizedEventName) return false;

  try {
    const { ok } = await requestJsonResult(buildOnboardingStateUrl().replace('/state', '/event'), {
      ...REQUEST_PROFILE_STORE_WRITE,
      method: 'POST',
      headers: buildOnboardingAuthHeaders().headers,
      body: JSON.stringify({ event: normalizedEventName })
    });
    return Boolean(ok);
  } catch (error) {
    logger.warn('⚠️ onboarding event post failed', { event: normalizedEventName, error });
    return false;
  }
}

export { fetchOnboardingState, postOnboardingEvent, resetOnboardingStateCache };
