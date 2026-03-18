import { escapeHtml } from './security.js';

const { gameState, DOM, player, CONFIG, coins, syncAllAudioUI } = window;

let {
  isWalletConnected = false,
  userWallet = null,
  primaryId = null
} = window;

function syncAuthGlobals() {
  ({
    isWalletConnected = false,
    userWallet = null,
    primaryId = null
  } = window);
}

function showBonusText(text) {
  gameState.bonusText = text;
  gameState.bonusTextTimer = 90;
}

function showStore() {
  syncAuthGlobals();
  if (!isWalletConnected) {
    alert("🔗 Connect wallet first!");
    return;
  }

  DOM.gameStart.classList.add("hidden");
  document.getElementById("storeScreen").classList.add("visible");
  document.getElementById("walletCorner").style.display = "none";
  document.getElementById("audioTogglesGlobal").style.display = "none";

  syncAllAudioUI();
  if (typeof window.applyStoreDefaultLockState === "function") window.applyStoreDefaultLockState();
  window.loadPlayerUpgrades().then(() => { window.updateStoreUI(); });
  console.log("🛒 Store opened");
}

function hideStore() {
  document.getElementById("storeScreen").classList.remove("visible");
  DOM.gameStart.classList.remove("hidden");
  document.getElementById("audioTogglesGlobal").style.display = "flex";
  document.getElementById("walletCorner").style.display = "flex";
  console.log("🛒 Store closed");
}

function updateUI() {
  gameState.uiUpdateFrame++;

  DOM.distanceVal.textContent = Math.floor(gameState.distance);
  DOM.scoreVal.textContent = Math.floor(gameState.score);

  if (gameState.uiUpdateFrame % 5 === 0) {
    DOM.shieldVal.textContent = player.shieldCount > 0 ? String(player.shieldCount) : "✗";
    DOM.multiplierVal.textContent = gameState.baseMultiplier > 1
      ? `x${gameState.baseMultiplier} ${gameState.x2Timer.toFixed(1)}s`
      : "x1";
    DOM.speedVal.textContent = (gameState.speed / CONFIG.SPEED_START).toFixed(2) + "x";
  }

  if (gameState.uiUpdateFrame % 10 === 0) {
    DOM.magnetVal.textContent = player.magnetActive ? `✓ ${player.magnetTimer.toFixed(1)}s` : "OFF";
    DOM.invertVal.textContent = player.invertActive ? `INV ${player.invertTimer.toFixed(1)}s` : "OK";
    DOM.spinVal.textContent = gameState.spinCooldown > 0 ? `⏳ ${(gameState.spinCooldown / 60).toFixed(1)}s` : "✓";
    DOM.goldVal.textContent = gameState.goldCoins;
    DOM.silverVal.textContent = gameState.silverCoins;
    DOM.coinsCountVal.textContent = coins.length;
  }
}

/* ===== LEADERBOARD ===== */

function showLeaderboardSkeletons() {
  const skeletonHTML = Array(5).fill(`
    <div class="skeleton-row">
      <div class="skeleton-block skeleton-rank"></div>
      <div class="skeleton-block skeleton-wallet"></div>
      <div class="skeleton-block skeleton-score"></div>
    </div>
  `).join('');

  const startList = document.getElementById('startLeaderboardList');
  if (startList) startList.innerHTML = skeletonHTML;
  const goList = document.getElementById('gameOverLeaderboardList');
  if (goList) goList.innerHTML = skeletonHTML;
}

function displayLeaderboard(leaderboard, playerPosition) {
  syncAuthGlobals();
  let html = '';

  if (Array.isArray(leaderboard) && leaderboard.length > 0) {
    const getEntryScore = (entry) => {
      if (!entry || typeof entry !== 'object') return 0;
      // Backend historically used both `bestScore` and `score` fields.
      return parseInt(entry.bestScore ?? entry.score) || 0;
    };

    const sorted = leaderboard
      .filter(entry => getEntryScore(entry) > 0)
      .sort((a, b) => getEntryScore(b) - getEntryScore(a))
      .slice(0, 10);

    if (sorted.length === 0) {
      html = '<div class="lb-empty">No results</div>';
    } else {
      html = sorted.map((entry, idx) => {
        const score = getEntryScore(entry);
        const isMe = entry.wallet === userWallet || entry.wallet === primaryId;

        let rankClass = '';
        if (idx === 0) rankClass = 'gold';
        else if (idx === 1) rankClass = 'silver';
        else if (idx === 2) rankClass = 'bronze';

        const rowClass = isMe ? 'lb-row lb-row--me' : 'lb-row';

        // Use displayName from backend, fallback to wallet formatting
        let name = '';
        if (entry.displayName) {
          name = escapeHtml(entry.displayName);
        } else if (entry.wallet && entry.wallet.startsWith('0x')) {
          name = escapeHtml(`${entry.wallet.slice(0, 6)}...${entry.wallet.slice(-4)}`);
        } else if (entry.wallet) {
          name = escapeHtml(entry.wallet.length > 14 ? `${entry.wallet.slice(0, 10)}...` : entry.wallet);
        } else {
          name = escapeHtml('Unknown');
        }

        return `
          <div class="${rowClass}">
            <span class="lb-rank ${rankClass}">#${idx + 1}</span>
            <span class="lb-wallet">${name}${isMe ? ' 👤' : ''}</span>
            <span class="lb-score"><span class="icon-atlas" style="width:16px;height:16px;background-size:80px auto;background-position:-64px -16px;margin-right:4px"></span>${score.toLocaleString()}</span>
          </div>
        `;
      }).join('');
    }
  } else {
    html = '<div class="lb-empty">No data</div>';
  }

  const startList = document.getElementById('startLeaderboardList');
  if (startList) startList.innerHTML = html;
  const goList = document.getElementById('gameOverLeaderboardList');
  if (goList) goList.innerHTML = html;
}

Object.assign(window, {
  showBonusText,
  showStore,
  hideStore,
  updateUI,
  showLeaderboardSkeletons,
  displayLeaderboard
});

export {
  showBonusText,
  showStore,
  hideStore,
  updateUI,
  showLeaderboardSkeletons,
  displayLeaderboard
};
