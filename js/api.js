import { getInjectedEthereumProvider } from './ethereum-provider.js';
import { logger } from './logger.js';
// @ts-check

import { BACKEND_URL } from './config.js';
import { request, requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_AUTH_WRITE } from './request.js';
import { DOM, getGameplayProgressSnapshot } from './state.js';
import { WC } from './walletconnect.js';
import { showBonusText, showLeaderboardSkeletons, displayLeaderboard, updateGameOverLeaderboardNotice, setGameOverPrompt } from './ui.js';
import { validatePlayerInsights, getRankBucket } from './game/leaderboard-insights.js';
import { isTelegramAuthMode, hasWalletAuthSession, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getAuthStateSnapshot, isTelegramMiniApp } from './features/auth/index.js';
import { canPersistProgress, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './features/store/index.js';

const SAVE_RESULT_STATUS = Object.freeze({
  SAVED: 'saved',
  SKIPPED: 'skipped',
  FAILED: 'failed'
});

/**
 * @typedef {Object} LeaderboardPlayerData
 * @property {number} [bestScore]
 * @property {number|string} [position]
 * @property {number} [totalGoldCoins]
 * @property {number} [totalSilverCoins]
 */

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} wallet
 * @property {number} score
 * @property {number} [distance]
 * @property {number} [goldCoins]
 * @property {number} [silverCoins]
 */

/**
 * @typedef {Object} LeaderboardTopResponseV1
 * @property {Array<LeaderboardEntry>} leaderboard
 * @property {number|null} playerPosition
 */

/**
 * @typedef {LeaderboardTopResponseV1 & { playerInsights?: unknown }} LeaderboardTopResponseV2
 */

/**
 * @typedef {Object} LegacySigningPayload
 * @property {string} wallet
 * @property {number} score
 * @property {number} distance
 * @property {number} timestamp
 */

/**
 * @typedef {Object} WalletSavePayload
 * @property {string} wallet
 * @property {number} score
 * @property {number} distance
 * @property {number} goldCoins
 * @property {number} silverCoins
 * @property {number} timestamp
 * @property {string} signature
 */

/**
 * @typedef {Object} TelegramSavePayload
 * @property {string} wallet
 * @property {number} score
 * @property {number} distance
 * @property {number} goldCoins
 * @property {number} silverCoins
 * @property {number} timestamp
 * @property {'telegram'} authMode
 * @property {number|string} telegramId
 */

/* ===== AUTH HELPERS ===== */

function isAuthenticated() {
  return hasAuthenticatedSession();
}

function getAuthIdentifier() {
  return getPrimaryAuthIdentifier();
}

function getSigningWalletAddress() {
  return getSigningWalletAddressFromAuth();
}

function getWalletStatNodes() {
  return {
    rankEl: DOM.walletRank,
    bestEl: DOM.walletBest,
    goldEl: DOM.walletGold,
    silverEl: DOM.walletSilver
  };
}

function resetWalletPlayerUI() {
  const { rankEl, bestEl, goldEl, silverEl } = getWalletStatNodes();

  if (rankEl) rankEl.textContent = "—";
  if (bestEl) bestEl.textContent = "0";
  if (goldEl) goldEl.textContent = "0";
  if (silverEl) silverEl.textContent = "0";
}

function resetLeaderboardUI() {
  displayLeaderboard([], null);
  updateGameOverLeaderboardNotice();
}

/* ===== WALLET UI ===== */

async function updateWalletUI() {
  const primaryId = getPrimaryAuthIdentifier();
  if (!hasWalletAuthSession() || !primaryId) {
    DOM.walletInfo.classList.remove("visible");
    return;
  }

  try {
    const url = `${BACKEND_URL}/api/leaderboard/player/${encodeURIComponent(primaryId)}`;
    /** @type {{ ok: boolean, status: number, data: LeaderboardPlayerData }} */
    const { ok, data: playerData } = await requestJsonResult(url, REQUEST_PROFILE_LEADERBOARD_READ);

    if (ok) {
      const { rankEl, bestEl, goldEl, silverEl } = getWalletStatNodes();

      if (rankEl) {
        const hasScore = (playerData.bestScore || 0) > 0;
        rankEl.textContent = hasScore ? `#${playerData.position || '—'}` : '#';
      }
      if (bestEl) bestEl.textContent = playerData.bestScore || 0;
      if (goldEl) goldEl.textContent = playerData.totalGoldCoins || 0;
      if (silverEl) silverEl.textContent = playerData.totalSilverCoins || 0;
    }
  } catch (e) {
    logger.error("❌ Error fetching player data:", e);
  }
}

/**
 * @param {string} message
 * @returns {Promise<string|null>}
 */
async function signMessage(message) {
  const walletForSignature = getSigningWalletAddress();
  try {
    if (isTelegramAuthMode()) {
      // Telegram users can't sign EIP-191 messages
      return null;
    }
    if (!isAuthenticated()) return null;
    if (getInjectedEthereumProvider()) {
      const signature = await getInjectedEthereumProvider().request({
        method: 'personal_sign',
        params: [message, walletForSignature]
      });
      return signature;
    } else if (WC.isConnected()) {
      return await WC.signMessage(message);
    }
    return null;
  } catch (error) {
    logger.error("❌ Signature error:", error);
    return null;
  }
}


async function loadAndDisplayLeaderboard(options = {}) {
  const runToken = options?.runToken ?? null;
  const { userWallet = '' } = getAuthStateSnapshot();
  showLeaderboardSkeletons();
  try {
    const normalizedWallet = String(userWallet || '').trim();
    const leaderboardUrl = new URL(`${BACKEND_URL}/api/leaderboard/top`);
    if (normalizedWallet) {
      leaderboardUrl.searchParams.set('wallet', normalizedWallet);
      leaderboardUrl.searchParams.set('v', '2');
    }

    /** @type {{ ok: boolean, status: number, data: LeaderboardTopResponseV1|LeaderboardTopResponseV2 }} */
    const { ok, data } = await requestJsonResult(leaderboardUrl.toString(), REQUEST_PROFILE_LEADERBOARD_READ);

    let playerInsights = null;
    let insightsReason = normalizedWallet ? 'no_data' : 'no_wallet';

    if (ok) {
      const topInsights = validatePlayerInsights(data?.playerInsights);
      if (topInsights.ok) {
        playerInsights = topInsights.data;
        insightsReason = null;
      } else if (normalizedWallet) {
        try {
          const insightsUrl = new URL(`${BACKEND_URL}/api/leaderboard/insights`);
          insightsUrl.searchParams.set('wallet', normalizedWallet);
          const insightsResult = await requestJsonResult(insightsUrl.toString(), REQUEST_PROFILE_LEADERBOARD_READ);
          if (insightsResult.ok) {
            const fallbackInsights = validatePlayerInsights(insightsResult.data?.playerInsights ?? insightsResult.data);
            if (fallbackInsights.ok) {
              playerInsights = fallbackInsights.data;
              insightsReason = null;
            } else {
              insightsReason = 'validation_error';
            }
          } else {
            insightsReason = 'api_error';
          }
        } catch (error) {
          logger.warn('⚠️ Leaderboard insights fallback error:', error);
          insightsReason = 'api_error';
        }
      }

      const rankBucket = getRankBucket(playerInsights?.rank ?? data?.playerPosition);
      const gameOverPrompt = data?.gameOverPrompt && typeof data.gameOverPrompt === 'object' ? data.gameOverPrompt : null;
      if (gameOverPrompt) setGameOverPrompt(gameOverPrompt, { source: 'save', runToken });
      displayLeaderboard(data?.leaderboard, data?.playerPosition, {
        playerInsights,
        insightsReason,
        rankBucket,
        gameOverPrompt,
        promptSource: 'save',
        runToken
      });
      return { ok: true, playerInsights, insightsReason, rankBucket };
    }

    displayLeaderboard([], null, { insightsReason: normalizedWallet ? 'api_error' : 'no_wallet', rankBucket: 'unknown' });
    return { ok: false, playerInsights: null, insightsReason: normalizedWallet ? 'api_error' : 'no_wallet', rankBucket: 'unknown' };
  } catch (e) {
    logger.error("❌ Leaderboard error:", e);
    displayLeaderboard([], null, { insightsReason: 'api_error', rankBucket: 'unknown' });
    return { ok: false, playerInsights: null, insightsReason: 'api_error', rankBucket: 'unknown' };
  }
}


async function saveResultToLeaderboard(options = {}) {
  const runToken = options?.runToken ?? null;
  const primaryId = getPrimaryAuthIdentifier();
  if (!isAuthenticated()) {
    if (isUnauthRuntimeMode()) {
      logger.info("⚪ Unauth runtime mode — leaderboard persistence disabled");
      return { status: SAVE_RESULT_STATUS.SKIPPED, reason: 'unauth_runtime' };
    }
    logger.info("⚪ Not authenticated — result not saved");
    return { status: SAVE_RESULT_STATUS.SKIPPED, reason: 'not_authenticated' };
  }

  if (!canPersistProgress() || !isEligibleForLeaderboardFlow()) {
    logger.info("⚪ Runtime config disables leaderboard persistence");
    return { status: SAVE_RESULT_STATUS.SKIPPED, reason: 'persistence_disabled' };
  }

  const identifier = getAuthIdentifier();
  const { score, distance, goldCoins, silverCoins } = getGameplayProgressSnapshot();

  if (score <= 0 && distance <= 0 && goldCoins <= 0 && silverCoins <= 0) {
    logger.info("⚪ Empty run — skip leaderboard save");
    return { status: SAVE_RESULT_STATUS.SKIPPED, reason: 'empty_run' };
  }

  try {
    const timestamp = Date.now();
    /** @type {WalletSavePayload|TelegramSavePayload} */
    let data;
    /** @type {{wallet:string, score:number, distance:number, timestamp:number}|null} */
    let legacySigningPayload = null;
    let originalWallet = "";
    let walletForSignature = "";
    
    if (isTelegramAuthMode()) {
      const telegramId = getTelegramAuthIdentifier();
      if (!telegramId) {
        logger.warn("⚠️ Telegram ID missing — result not saved");
        return { status: SAVE_RESULT_STATUS.FAILED, reason: 'telegram_id_missing' };
      }

      data = {
        wallet: String(primaryId),
        score,
        distance,
        goldCoins,
        silverCoins,
        timestamp,
        authMode: "telegram",
        telegramId
      };
    } else {
      originalWallet = String(identifier || "").trim();
      walletForSignature = getSigningWalletAddress() || String(identifier || "").toLowerCase();
      const messageToSign = `Save game result\nWallet: ${walletForSignature}\nScore: ${score}\nDistance: ${distance}\nGoldCoins: ${goldCoins}\nSilverCoins: ${silverCoins}\nTimestamp: ${timestamp}`;
      legacySigningPayload = {
        wallet: walletForSignature,
        score,
        distance,
        timestamp
      };
      const signature = await signMessage(messageToSign);
      if (!signature) {
        logger.error("❌ Failed to get signature");
        return { status: SAVE_RESULT_STATUS.FAILED, reason: 'signature_missing' };
      }
      
      data = {
        wallet: walletForSignature,
        score,
        distance,
        goldCoins,
        silverCoins,
        timestamp,
        signature
      };
    }

    let response = await request(`${BACKEND_URL}/api/leaderboard/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wallet": data.wallet },
      body: JSON.stringify(data)
    });

    if (!response.ok && response.status === 401 && !isTelegramAuthMode() && legacySigningPayload) {
      const legacyMessageToSign = `Save game result\nWallet: ${legacySigningPayload.wallet}\nScore: ${legacySigningPayload.score}\nDistance: ${legacySigningPayload.distance}\nTimestamp: ${legacySigningPayload.timestamp}`;
      const legacySignature = await signMessage(legacyMessageToSign);

      if (legacySignature) {
        logger.warn("⚠️ Retrying leaderboard save with legacy signature payload");
        response = await request(`${BACKEND_URL}/api/leaderboard/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Wallet": data.wallet },
          body: JSON.stringify({ ...data, signature: legacySignature })
        });
      }
    }

    if (!response.ok && response.status === 401 && !isTelegramAuthMode() && originalWallet && originalWallet !== walletForSignature) {
      const messageToSignOriginalWallet = `Save game result\nWallet: ${originalWallet}\nScore: ${score}\nDistance: ${distance}\nGoldCoins: ${goldCoins}\nSilverCoins: ${silverCoins}\nTimestamp: ${timestamp}`;
      const signatureOriginalWallet = await signMessage(messageToSignOriginalWallet);

      if (signatureOriginalWallet) {
        logger.warn("⚠️ Retrying leaderboard save with original wallet casing");
        response = await request(`${BACKEND_URL}/api/leaderboard/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Wallet": originalWallet },
          body: JSON.stringify({ ...data, wallet: originalWallet, signature: signatureOriginalWallet })
        });
      }
    }

    
    if (response.ok) {
      let responseData = null;
      try {
        responseData = await response.json();
      } catch (_error) {
        responseData = null;
      }
      const savePrompt = responseData?.gameOverPrompt && typeof responseData.gameOverPrompt === 'object'
        ? responseData.gameOverPrompt
        : null;
      if (savePrompt) setGameOverPrompt(savePrompt, { source: 'save', runToken });
      logger.info("✅ Result saved!");
      showBonusText("✅ In leaderboard!");
      await loadAndDisplayLeaderboard({ runToken });
      await updateWalletUI();
      return { status: SAVE_RESULT_STATUS.SAVED, gameOverPrompt: savePrompt };
    }
    
    const errText = await response.text();
    if (response.status === 400) {
      logger.warn("⚠️ Leaderboard save rejected (400):", errText || "Bad Request");
      return { status: SAVE_RESULT_STATUS.FAILED, reason: 'bad_request' };
    }

    logger.error("❌ Save error:", response.status, errText);
    return { status: SAVE_RESULT_STATUS.FAILED, reason: `http_${response.status}` };
  } catch (error) {
    logger.error("❌ Error sending result:", error);
    return { status: SAVE_RESULT_STATUS.FAILED, reason: 'network_error' };
  }
}

async function fetchGameOverPreview({ score, distance, isAuthenticated, runToken = null }) {
  try {
    const payload = {
      score: Math.max(0, Math.floor(Number(score) || 0)),
      distance: Math.max(0, Math.floor(Number(distance) || 0)),
      isAuthenticated: Boolean(isAuthenticated)
    };
    const response = await request(`${BACKEND_URL}/api/leaderboard/game-over-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    const prompt = data?.gameOverPrompt && typeof data.gameOverPrompt === 'object' ? data.gameOverPrompt : null;
    if (prompt) setGameOverPrompt(prompt, { source: 'preview', runToken });
    return prompt;
  } catch (error) {
    logger.warn('⚠️ game-over-preview failed:', error);
    return null;
  }
}

/**
 * @typedef {Object} SharePayload
 * @property {number} [scoreForShare]
 * @property {string} shareUrl
 * @property {string} postText
 */

/**
 * @param {string} wallet
 * @returns {Promise<{ok:boolean,status:number,data:SharePayload}>}
 */
async function fetchSharePayload(wallet) {
  const normalizedWallet = String(wallet || '').trim();
  if (!normalizedWallet) {
    return {
      ok: false,
      status: 400,
      data: { shareUrl: '', postText: '' }
    };
  }

  const url = `${BACKEND_URL}/api/leaderboard/share/payload/${encodeURIComponent(normalizedWallet)}`;
  return requestJsonResult(url, REQUEST_PROFILE_LEADERBOARD_READ);
}

/* ===== NEW PROFILE & REFERRAL & SHARE & X API HELPERS ===== */

function buildAuthHeaders() {
  const primaryId = getPrimaryAuthIdentifier();
  const wallet = getSigningWalletAddress(); // real wallet address, if available
  const headers = { 'Content-Type': 'application/json' };
  if (primaryId) {
    headers['X-Primary-Id'] = String(primaryId);
    // legacy fallback
    headers['X-Wallet'] = String(wallet || primaryId);
  }
  // in Telegram Mini App also send initData
  try {
    if (isTelegramMiniApp() && window.Telegram?.WebApp?.initData) {
      headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
    }
  } catch (_e) {}
  return headers;
}

async function fetchMyProfile() {
  const primaryId = getPrimaryAuthIdentifier();
  if (!primaryId) return null;
  try {
    const { ok, data } = await requestJsonResult(`${BACKEND_URL}/api/account/me/profile`, {
      ...REQUEST_PROFILE_LEADERBOARD_READ,
      headers: buildAuthHeaders()
    });
    return ok ? data : null;
  } catch (e) {
    logger.warn('⚠️ fetchMyProfile error:', e);
    return null;
  }
}

async function fetchCoinHistory(limit = 50) {
  const primaryId = getPrimaryAuthIdentifier();
  if (!primaryId) return [];
  try {
    const url = `${BACKEND_URL}/api/account/me/coin-history?limit=${encodeURIComponent(limit)}`;
    const { ok, data } = await requestJsonResult(url, {
      ...REQUEST_PROFILE_LEADERBOARD_READ,
      headers: buildAuthHeaders()
    });
    if (!ok) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.history)) return data.history;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  } catch (e) {
    logger.warn('⚠️ fetchCoinHistory error:', e);
    return [];
  }
}

async function startShare() {
  const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/share/start`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({})
  });
  return { ok, status, data };
}

async function confirmShare(shareId) {
  const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/share/confirm`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ shareId })
  });
  return { ok, status, data };
}

async function getXOAuthAuthorizeUrl() {
  try {
    const { ok, data } = await requestJsonResult(`${BACKEND_URL}/api/x/oauth/start?mode=json`, {
      ...REQUEST_PROFILE_AUTH_WRITE,
      headers: buildAuthHeaders()
    });
    return ok ? (data?.authorizeUrl || null) : null;
  } catch (e) {
    logger.warn('⚠️ getXOAuthAuthorizeUrl error:', e);
    return null;
  }
}

async function disconnectX() {
  const { ok, data } = await requestJsonResult(`${BACKEND_URL}/api/x/disconnect`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({})
  });
  return { ok, data };
}

async function getXStatus() {
  try {
    const { ok, data } = await requestJsonResult(`${BACKEND_URL}/api/x/status`, {
      ...REQUEST_PROFILE_LEADERBOARD_READ,
      headers: buildAuthHeaders()
    });
    return ok ? data : null;
  } catch (e) {
    logger.warn('⚠️ getXStatus error:', e);
    return null;
  }
}


async function applyReferralCode(referralCode) {
  return requestJsonResult(`${BACKEND_URL}/api/referrals/apply`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ referralCode })
  });
}

async function setNickname(nickname) {
  return requestJsonResult(`${BACKEND_URL}/api/account/me/nickname`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ nickname })
  });
}

async function setLeaderboardDisplay(mode) {
  return requestJsonResult(`${BACKEND_URL}/api/account/me/display-mode`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ mode })
  });
}

export {
  isAuthenticated,
  getAuthIdentifier,
  updateWalletUI,
  resetWalletPlayerUI,
  signMessage,
  loadAndDisplayLeaderboard,
  resetLeaderboardUI,
  saveResultToLeaderboard,
  fetchGameOverPreview,
  fetchMyProfile,
  fetchCoinHistory,
  applyReferralCode,
  startShare,
  confirmShare,
  getXOAuthAuthorizeUrl,
  disconnectX,
  setNickname,
  setLeaderboardDisplay
};
