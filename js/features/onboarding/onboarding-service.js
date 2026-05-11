import { buildBackendUrl } from '../../config.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_STORE_WRITE } from '../../request.js';
import { logger } from '../../logger.js';
import { normalizeOnboardingState } from './onboarding-state.js';
import { getPrimaryAuthIdentifier, getSigningWalletAddress, isTelegramMiniApp } from '../auth/index.js';
import { getTelegramInitData } from '../../auth-telegram.js';

let onboardingStateInFlightPromise = null;
let onboardingStateCache = null;
let hasLoggedMissingIdentity = false;

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
  if (onboardingStateCache) return onboardingStateCache;
  if (onboardingStateInFlightPromise) return onboardingStateInFlightPromise;

  const { headers, hasIdentity } = buildOnboardingAuthHeaders();
  const shouldFetchRemote = hasIdentity && isTelegramMiniApp();
  if (!shouldFetchRemote) {
    if (!hasLoggedMissingIdentity) {
      hasLoggedMissingIdentity = true;
      logger.info('🧭 onboarding state: skip remote fetch (telegram/user identity unavailable)');
    }
    onboardingStateCache = null;
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
          onboardingStateCache = null;
          return null;
        }
        return null;
      }

      const normalizedState = normalizeOnboardingState(data?.onboarding || data);
      onboardingStateCache = normalizedState;
      return normalizedState;
    } catch (_error) {
      logger.info('🧭 onboarding state fetch failed, using local fallback');
      onboardingStateCache = null;
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
