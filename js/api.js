/* ===== AUTH HELPERS ===== */
async function requestJson(url, options = {}, meta = {}) {
  const timeoutMs = meta.timeoutMs || 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.context = {
        area: meta.area || 'unknown',
        endpoint: meta.endpoint || url,
        status: response.status
      };
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Request timeout');
      timeoutError.context = {
        area: meta.area || 'unknown',
        endpoint: meta.endpoint || url,
        timeoutMs
      };
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postJson(url, body, meta = {}, options = {}) {
  return requestJson(url, {
    method: 'POST',
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(body),
    ...options
  }, meta);
}


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
    const playerData = await requestJson(url, {}, { area: 'wallet-ui', endpoint: '/api/leaderboard/player/:id' });

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
  } catch (e) {
    console.error("❌ Error fetching player data:", e.context || e.message, e.payload || '');
  }
}

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
    const data = await requestJson(url, {}, { area: 'leaderboard', endpoint: '/api/leaderboard/top' });
    displayLeaderboard(data.leaderboard, data.playerPosition);
  } catch (e) {
    console.error("❌ Leaderboard error:", e.context || e.message, e.payload || '');
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
    let data;

    if (authMode === "telegram") {
       const telegramId = telegramUser?.id || linkedTelegramId || null;
      if (!telegramId) {
        console.warn("⚠️ Telegram ID missing — result not saved");
        return;
      }

      data = {
        wallet: primaryId,
        score,
        distance,
        goldCoins,
        silverCoins,
        timestamp,
        authMode: "telegram",
        telegramId
      };
    } else {
       const messageToSign = `Save game result
        Wallet: ${identifier}
        Score: ${score}
        Distance: ${distance}
        Timestamp: ${timestamp}`;
      const signature = await signMessage(messageToSign);
      if (!signature) { console.error("❌ Failed to get signature"); return; }
      
      data = {
        wallet: identifier,
        score,
        distance,
        goldCoins,
        silverCoins,
        timestamp,
        signature
      };
    }

    await postJson(`${BACKEND_URL}/api/leaderboard/save`, data, {
      area: 'leaderboard-save',
      endpoint: '/api/leaderboard/save'
    }, {
      headers: { 'X-Wallet': primaryId || identifier }
    });

    console.log("✅ Result saved!");
    showBonusText("✅ In leaderboard!");
    await loadAndDisplayLeaderboard();
    await updateWalletUI();
  } catch (error) {
    if (error?.context?.status === 400) {
      const details = typeof error.payload === 'string' ? error.payload : (error.payload?.error || 'Bad Request');
      console.warn("⚠️ Leaderboard save rejected (400):", details);
      return;
    }

    console.error("❌ Error sending result:", error.context || error.message, error.payload || '');
  }
}

