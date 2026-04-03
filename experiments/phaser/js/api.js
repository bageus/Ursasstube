// @ts-check

import { BACKEND_DISABLED, BACKEND_URL } from './config.js';
import { request } from './request.js';
import { DOM, gameState } from './state.js';
import { WC } from './walletconnect.js';
import { showBonusText, showLeaderboardSkeletons, displayLeaderboard, updateGameOverLeaderboardNotice } from './ui.js';
import { isTelegramAuthMode, hasWalletAuthSession, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getLeaderboardWalletAddress } from './auth.js';
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


const OFFLINE_LEADERBOARD_STORAGE_KEY = 'ursassOfflineLeaderboard';

function readOfflineLeaderboard() {
  try {
    const raw = localStorage.getItem(OFFLINE_LEADERBOARD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineLeaderboard(entries) {
  try {
    localStorage.setItem(OFFLINE_LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage write failures
  }
}

function buildOfflinePlayerData(identifier) {
  const normalizedId = String(identifier || '').trim().toLowerCase();
  const entries = readOfflineLeaderboard();
  const sorted = entries
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const playerEntry = sorted.find((entry) => String(entry.wallet || '').trim().toLowerCase() === normalizedId);
  const position = playerEntry ? (sorted.findIndex((entry) => entry === playerEntry) + 1) : null;

  return {
    bestScore: Number(playerEntry?.score || 0),
    position,
    totalGoldCoins: Number(playerEntry?.goldCoins || 0),
    totalSilverCoins: Number(playerEntry?.silverCoins || 0)
  };
}

function getOfflineLeaderboardResponse() {
  const entries = readOfflineLeaderboard()
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const userWallet = String(getLeaderboardWalletAddress() || '').trim().toLowerCase();
  const playerPosition = userWallet
    ? (entries.findIndex((entry) => String(entry.wallet || '').trim().toLowerCase() === userWallet) + 1 || null)
    : null;

  return {
    leaderboard: entries.slice(0, 10),
    playerPosition
  };
}

function saveOfflineLeaderboardEntry(payload) {
  const wallet = String(payload.wallet || '').trim().toLowerCase();
  if (!wallet) return false;

  const entries = readOfflineLeaderboard();
  const existingIndex = entries.findIndex((entry) => String(entry.wallet || '').trim().toLowerCase() === wallet);
  const existing = existingIndex >= 0 ? entries[existingIndex] : null;
  const nextEntry = {
    wallet,
    displayName: wallet.startsWith('0x') ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet,
    score: Math.max(Number(existing?.score || 0), Number(payload.score || 0)),
    distance: Math.max(Number(existing?.distance || 0), Number(payload.distance || 0)),
    goldCoins: Math.max(Number(existing?.goldCoins || 0), Number(payload.goldCoins || 0)),
    silverCoins: Math.max(Number(existing?.silverCoins || 0), Number(payload.silverCoins || 0)),
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) entries.splice(existingIndex, 1, nextEntry);
  else entries.push(nextEntry);

  writeOfflineLeaderboard(entries);
  return true;
}

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

function resetWalletPlayerUI() {
  const rankEl = document.getElementById("walletRank");
  const bestEl = document.getElementById("walletBest");
  const goldEl = document.getElementById("walletGold");
  const silverEl = document.getElementById("walletSilver");

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
  if (BACKEND_DISABLED) {
    const primaryId = getPrimaryAuthIdentifier();
    if (!primaryId) {
      DOM.walletInfo.classList.remove('visible');
      resetWalletPlayerUI();
      return;
    }

    const playerData = buildOfflinePlayerData(primaryId);
    const rankEl = document.getElementById('walletRank');
    const bestEl = document.getElementById('walletBest');
    const goldEl = document.getElementById('walletGold');
    const silverEl = document.getElementById('walletSilver');

    if (rankEl) rankEl.textContent = playerData.bestScore > 0 ? `#${playerData.position || '—'}` : '—';
    if (bestEl) bestEl.textContent = String(playerData.bestScore || 0);
    if (goldEl) goldEl.textContent = String(playerData.totalGoldCoins || 0);
    if (silverEl) silverEl.textContent = String(playerData.totalSilverCoins || 0);
    DOM.walletInfo.classList.add('visible');
    return;
  }

  const primaryId = getPrimaryAuthIdentifier();
  if (!hasWalletAuthSession() || !primaryId) {
    DOM.walletInfo.classList.remove("visible");
    return;
  }

  try {
    const url = `${BACKEND_URL}/api/leaderboard/player/${encodeURIComponent(primaryId)}`;
    const response = await request(url);
    /** @type {LeaderboardPlayerData} */
    const playerData = await response.json();

    if (response.ok) {
      const rankEl = document.getElementById("walletRank");
      const bestEl = document.getElementById("walletBest");
      const goldEl = document.getElementById("walletGold");
      const silverEl = document.getElementById("walletSilver");

      if (rankEl) {
        const hasScore = (playerData.bestScore || 0) > 0;
        rankEl.textContent = hasScore ? `#${playerData.position || '—'}` : '#';
      }
      if (bestEl) bestEl.textContent = playerData.bestScore || 0;
      if (goldEl) goldEl.textContent = playerData.totalGoldCoins || 0;
      if (silverEl) silverEl.textContent = playerData.totalSilverCoins || 0;
    }
  } catch (e) {
    console.error("❌ Error fetching player data:", e);
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
    console.error("❌ Signature error:", error);
    return null;
  }
}


async function loadAndDisplayLeaderboard() {
  if (BACKEND_DISABLED) {
    const data = getOfflineLeaderboardResponse();
    displayLeaderboard(data.leaderboard, data.playerPosition);
    updateGameOverLeaderboardNotice(data.leaderboard.length ? 'Offline leaderboard' : 'Offline leaderboard is empty');
    console.log('🧪 Backend disabled — offline leaderboard loaded');
    return;
  }

  const userWallet = getLeaderboardWalletAddress();
  showLeaderboardSkeletons();
  try {
    const url = `${BACKEND_URL}/api/leaderboard/top?wallet=${userWallet || ''}`;
    const response = await request(url);
    /** @type {LeaderboardTopResponse} */
    const data = await response.json();
    if (response.ok) {
      displayLeaderboard(data.leaderboard, data.playerPosition);
    } else {
      displayLeaderboard([], null);
    }
  } catch (e) {
    console.error("❌ Leaderboard error:", e);
    displayLeaderboard([], null);
  }
}

async function saveResultToLeaderboard() {
  if (BACKEND_DISABLED) {
    const wallet = String(getPrimaryAuthIdentifier() || getLeaderboardWalletAddress() || 'offline-player').trim().toLowerCase();
    const saved = saveOfflineLeaderboardEntry({
      wallet,
      score: Math.max(0, Math.floor(gameState.score || 0)),
      distance: Math.max(0, Math.floor(gameState.distance || 0)),
      goldCoins: Math.max(0, Math.floor(gameState.goldCoins || 0)),
      silverCoins: Math.max(0, Math.floor(gameState.silverCoins || 0))
    });
    if (saved) {
      console.log('🧪 Backend disabled — result saved locally');
      showBonusText('✅ Saved locally');
      await loadAndDisplayLeaderboard();
      await updateWalletUI();
    }
    return;
  }

  const primaryId = getPrimaryAuthIdentifier();
  if (!isAuthenticated()) {
    if (isUnauthRuntimeMode()) {
      console.log("⚪ Unauth runtime mode — leaderboard persistence disabled");
      return;
    }
    console.log("⚪ Not authenticated — result not saved");
    return;
  }

  if (!canPersistProgress() || !isEligibleForLeaderboardFlow()) {
    console.log("⚪ Runtime config disables leaderboard persistence");
    return;
  }

  const identifier = getAuthIdentifier();
  const score = Math.max(0, Math.floor(gameState.score || 0));
  const distance = Math.max(0, Math.floor(gameState.distance || 0));
  const goldCoins = Math.max(0, Math.floor(gameState.goldCoins || 0));
  const silverCoins = Math.max(0, Math.floor(gameState.silverCoins || 0));

  if (score <= 0 && distance <= 0 && goldCoins <= 0 && silverCoins <= 0) {
    console.log("⚪ Empty run — skip leaderboard save");
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
        console.warn("⚠️ Telegram ID missing — result not saved");
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
        console.error("❌ Failed to get signature");
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

    if (!response.ok && response.status === 401 && authMode !== "telegram" && legacySigningPayload) {
      const legacyMessageToSign = `Save game result\nWallet: ${legacySigningPayload.wallet}\nScore: ${legacySigningPayload.score}\nDistance: ${legacySigningPayload.distance}\nTimestamp: ${legacySigningPayload.timestamp}`;
      const legacySignature = await signMessage(legacyMessageToSign);

      if (legacySignature) {
        console.warn("⚠️ Retrying leaderboard save with legacy signature payload");
        response = await request(`${BACKEND_URL}/api/leaderboard/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Wallet": data.wallet },
          body: JSON.stringify({ ...data, signature: legacySignature })
        });
      }
    }

    if (!response.ok && response.status === 401 && authMode !== "telegram" && originalWallet && originalWallet !== walletForSignature) {
      const messageToSignOriginalWallet = `Save game result\nWallet: ${originalWallet}\nScore: ${score}\nDistance: ${distance}\nGoldCoins: ${goldCoins}\nSilverCoins: ${silverCoins}\nTimestamp: ${timestamp}`;
      const signatureOriginalWallet = await signMessage(messageToSignOriginalWallet);

      if (signatureOriginalWallet) {
        console.warn("⚠️ Retrying leaderboard save with original wallet casing");
        response = await request(`${BACKEND_URL}/api/leaderboard/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Wallet": originalWallet },
          body: JSON.stringify({ ...data, wallet: originalWallet, signature: signatureOriginalWallet })
        });
      }
    }

    
    if (response.ok) {
      console.log("✅ Result saved!");
      showBonusText("✅ In leaderboard!");
      await loadAndDisplayLeaderboard();
      await updateWalletUI();
      return;
    }
    
    const errText = await response.text();
    if (response.status === 400) {
      console.warn("⚠️ Leaderboard save rejected (400):", errText || "Bad Request");
      return;
    }

    console.error("❌ Save error:", response.status, errText);
  } catch (error) {
    console.error("❌ Error sending result:", error);
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
