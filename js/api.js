import { logger } from './logger.js';
// @ts-check

import { BACKEND_URL } from './config.js';
import { request, requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ } from './request.js';
import { DOM, getGameplayProgressSnapshot } from './state.js';
import { WC } from './walletconnect.js';
import { showBonusText, showLeaderboardSkeletons, displayLeaderboard, updateGameOverLeaderboardNotice } from './ui.js';
import { isTelegramAuthMode, hasWalletAuthSession, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getAuthStateSnapshot } from './auth.js';
import { canPersistProgress, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './store.js';

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
 * @typedef {Object} LeaderboardTopResponse
 * @property {Array<LeaderboardEntry>} leaderboard
 * @property {number|null} playerPosition
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
    if (window.ethereum) {
      const signature = await window.ethereum.request({
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


async function loadAndDisplayLeaderboard() {
  const { userWallet = '' } = getAuthStateSnapshot();
  showLeaderboardSkeletons();
  try {
    const normalizedWallet = String(userWallet || '').trim();
    const leaderboardUrl = new URL(`${BACKEND_URL}/api/leaderboard/top`);
    if (normalizedWallet) leaderboardUrl.searchParams.set('wallet', normalizedWallet);

    /** @type {{ ok: boolean, status: number, data: LeaderboardTopResponse }} */
    const { ok, data } = await requestJsonResult(leaderboardUrl.toString(), REQUEST_PROFILE_LEADERBOARD_READ);
    if (ok) {
      displayLeaderboard(data.leaderboard, data.playerPosition);
    } else {
      displayLeaderboard([], null);
    }
  } catch (e) {
    logger.error("❌ Leaderboard error:", e);
    displayLeaderboard([], null);
  }
}

async function saveResultToLeaderboard() {
  const primaryId = getPrimaryAuthIdentifier();
  if (!isAuthenticated()) {
    if (isUnauthRuntimeMode()) {
      logger.info("⚪ Unauth runtime mode — leaderboard persistence disabled");
      return;
    }
    logger.info("⚪ Not authenticated — result not saved");
    return;
  }

  if (!canPersistProgress() || !isEligibleForLeaderboardFlow()) {
    logger.info("⚪ Runtime config disables leaderboard persistence");
    return;
  }

  const identifier = getAuthIdentifier();
  const { score, distance, goldCoins, silverCoins } = getGameplayProgressSnapshot();

  if (score <= 0 && distance <= 0 && goldCoins <= 0 && silverCoins <= 0) {
    logger.info("⚪ Empty run — skip leaderboard save");
    return;
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
        return;
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
        return;
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
      logger.info("✅ Result saved!");
      showBonusText("✅ In leaderboard!");
      await loadAndDisplayLeaderboard();
      await updateWalletUI();
      return;
    }
    
    const errText = await response.text();
    if (response.status === 400) {
      logger.warn("⚠️ Leaderboard save rejected (400):", errText || "Bad Request");
      return;
    }

    logger.error("❌ Save error:", response.status, errText);
  } catch (error) {
    logger.error("❌ Error sending result:", error);
  }
}

export {
  isAuthenticated,
  getAuthIdentifier,
  updateWalletUI,
  resetWalletPlayerUI,
  signMessage,
  loadAndDisplayLeaderboard,
  resetLeaderboardUI,
  saveResultToLeaderboard
};
