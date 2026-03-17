// @ts-check

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
  return (isWalletConnected && userWallet) || (authMode === "telegram" && primaryId);
}

function getAuthIdentifier() {
  return userWallet || primaryId || null;
}

/* ===== WALLET UI ===== */

async function updateWalletUI() {
  if (!isWalletConnected || !primaryId) {
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
  try {
    if (authMode === "telegram") {
      // Telegram users can't sign EIP-191 messages
      return null;
    }
    if (!isAuthenticated()) return null;
    if (window.ethereum) {
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, userWallet]
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
  if (!isAuthenticated()) {
    console.log("⚪ Not authenticated — result not saved");
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
    /** @type {LegacySigningPayload|null} */
    let legacySigningPayload = null;
    
    if (authMode === "telegram") {
       const telegramId = telegramUser?.id || linkedTelegramId || null;
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
      const walletForSignature = String(identifier || "").toLowerCase();
      const messageToSign = `Save game result\nWallet: ${walletForSignature}\nScore: ${score}\nDistance: ${distance}\nGoldCoins: ${goldCoins}\nSilverCoins: ${silverCoins}\nTimestamp: ${timestamp}`;
      legacySigningPayload = {
        wallet: walletForSignature,
        score,
        distance,
        timestamp,
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
