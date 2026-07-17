import { authState, markAuthExpired } from '../auth-state.js';
import { updateCachedBalance } from '../balance-cache.js';
import { BACKEND_URL } from '../config.js';
import { getPrimaryAuthIdentifier, getSigningWalletAddress, isTelegramMiniApp } from '../features/auth/index.js';
import { logger } from '../logger.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_AUTH_WRITE } from '../request.js';

/* ===== NEW PROFILE & REFERRAL & SHARE & X API HELPERS ===== */
function buildAuthHeaders() {
  const primaryId = getPrimaryAuthIdentifier();
  const wallet = getSigningWalletAddress(); // real wallet address, if available
  const headers = { 'Content-Type': 'application/json' };
  const sessionToken = String(authState.sessionToken || '').trim();
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  if (primaryId) {
    headers['X-Primary-Id'] = String(primaryId);
    if (wallet) headers['X-Wallet'] = String(wallet);
  }
  // in Telegram Mini App also send initData
  try {
    if (isTelegramMiniApp() && window.Telegram?.WebApp?.initData) {
      headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
    }
  } catch (_e) {}
  return headers;
}

function handleUnauthorizedResponse(status) {
  if (status !== 401) return;
  logger.warn('⚠️ Session token expired or missing. Re-auth required.');
  markAuthExpired();
}

async function fetchMyProfile() {
  try {
    const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/account/me/profile`, {
      ...REQUEST_PROFILE_LEADERBOARD_READ,
      headers: buildAuthHeaders()
    });
    handleUnauthorizedResponse(status);
    if (!ok) return null;
    updateCachedBalance({
      gold: data?.gold ?? data?.totalGoldCoins,
      silver: data?.silver ?? data?.totalSilverCoins
    });
    return data;
  } catch (e) {
    logger.warn('⚠️ fetchMyProfile error:', e);
    return null;
  }
}

async function fetchCoinHistory(limit = 50) {
  const url = `${BACKEND_URL}/api/account/me/coin-history?limit=${encodeURIComponent(limit)}`;
  const { ok, status, data } = await requestJsonResult(url, {
    ...REQUEST_PROFILE_LEADERBOARD_READ,
    headers: buildAuthHeaders()
  });
  handleUnauthorizedResponse(status);
  if (!ok) {
    const error = new Error('Failed to fetch coin history');
    error.status = data?.status;
    throw error;
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.history)) return data.history;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function startShare() {
  const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/share/start`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({})
  });
  handleUnauthorizedResponse(status);
  return { ok, status, data };
}

async function confirmShare(shareId) {
  const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/share/confirm`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ shareId })
  });
  handleUnauthorizedResponse(status);
  return { ok, status, data };
}

async function getXOAuthAuthorizeUrl() {
  try {
    const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/x/oauth/start?mode=json`, {
      ...REQUEST_PROFILE_AUTH_WRITE,
      headers: buildAuthHeaders()
    });
    handleUnauthorizedResponse(status);
    return ok ? (data?.authorizeUrl || null) : null;
  } catch (e) {
    logger.warn('⚠️ getXOAuthAuthorizeUrl error:', e);
    return null;
  }
}

async function disconnectX() {
  const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/x/disconnect`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({})
  });
  handleUnauthorizedResponse(status);
  return { ok, data };
}

async function getXStatus() {
  try {
    const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/x/status`, {
      ...REQUEST_PROFILE_LEADERBOARD_READ,
      headers: buildAuthHeaders()
    });
    handleUnauthorizedResponse(status);
    if (!ok) return null;
    updateCachedBalance({
      gold: data?.gold ?? data?.totalGoldCoins,
      silver: data?.silver ?? data?.totalSilverCoins
    });
    return data;
  } catch (e) {
    logger.warn('⚠️ getXStatus error:', e);
    return null;
  }
}

async function applyReferralCode(referralCode) {
  const result = await requestJsonResult(`${BACKEND_URL}/api/referral/apply`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ referralCode })
  });
  handleUnauthorizedResponse(result.status);
  return result;
}

async function setNickname(nickname) {
  const result = await requestJsonResult(`${BACKEND_URL}/api/account/me/nickname`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ nickname })
  });
  handleUnauthorizedResponse(result.status);
  return result;
}

async function setLeaderboardDisplay(mode) {
  const result = await requestJsonResult(`${BACKEND_URL}/api/account/me/display-mode`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ mode })
  });
  handleUnauthorizedResponse(result.status);
  return result;
}

export {
  applyReferralCode,
  buildAuthHeaders,
  confirmShare,
  disconnectX,
  fetchCoinHistory,
  fetchMyProfile,
  getXOAuthAuthorizeUrl,
  handleUnauthorizedResponse,
  setLeaderboardDisplay,
  setNickname,
  startShare
};
