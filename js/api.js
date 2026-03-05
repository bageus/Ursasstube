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
    const response = await fetch(url);
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
    const response = await fetch(url);
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
  try {
    const timestamp = Date.now();
    let data;

    if (authMode === "telegram") {
      data = {
        wallet: primaryId,
        score: Math.floor(gameState.score),
        distance: Math.floor(gameState.distance),
        goldCoins: gameState.goldCoins,
        silverCoins: gameState.silverCoins,
        timestamp,
        authMode: "telegram",
        telegramId: telegramUser.id
      };
    } else {
      const messageToSign = `Save game result\nWallet: ${identifier}\nScore: ${Math.floor(gameState.score)}\nDistance: ${Math.floor(gameState.distance)}\nTimestamp: ${timestamp}`;
      const signature = await signMessage(messageToSign);
      if (!signature) { console.error("❌ Failed to get signature"); return; }

      data = {
        wallet: identifier,
        score: Math.floor(gameState.score),
        distance: Math.floor(gameState.distance),
        goldCoins: gameState.goldCoins,
        silverCoins: gameState.silverCoins,
        timestamp,
        signature
      };
    }

    const response = await fetch(`${BACKEND_URL}/api/leaderboard/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wallet": primaryId || identifier },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      console.log("✅ Result saved!");
      showBonusText("✅ In leaderboard!");
      await loadAndDisplayLeaderboard();
      await updateWalletUI();
    } else {
      console.error("❌ Save error:", response.status);
    }
  } catch (error) {
    console.error("❌ Error sending result:", error);
  }
}

