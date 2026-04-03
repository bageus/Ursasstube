import { CONFIG } from './config.js';
import { DOM, gameState, player, coins } from './state.js';
import { syncAllAudioUI } from './audio.js';
import { getLeaderboardIdentity, hasWalletAuthSession } from './auth.js';
import { applyStoreDefaultLockState, loadPlayerUpgrades, updateStoreUI, setActiveStoreTab, closeDonationModal, isStoreAvailable, isUnauthRuntimeMode } from './store.js';
import { createIconAtlas, clearNode } from './dom-render.js';

function showBonusText(text) {
  gameState.bonusText = text;
  gameState.bonusTextTimer = CONFIG.BONUS_TEXT_DELAY_FRAMES + CONFIG.BONUS_TEXT_FADE_FRAMES;
}

function showStore() {
  if (!isStoreAvailable()) {
    alert(isUnauthRuntimeMode() ? "🛒 Store is unavailable in browser mode" : "🔗 Connect wallet first!");
    return;
  }

  if (!hasWalletAuthSession() && !isUnauthRuntimeMode()) {
    alert("🔗 Connect wallet first!");
    return;
  }

  DOM.gameStart.classList.add("hidden");
  document.getElementById("storeScreen").classList.add("visible");
  document.getElementById("walletCorner").style.display = "none";
  document.getElementById("audioTogglesGlobal").style.display = "none";

  syncAllAudioUI();
  applyStoreDefaultLockState();
  setActiveStoreTab('upgrade');
  loadPlayerUpgrades().then(() => { updateStoreUI(); });
  console.log("🛒 Store opened");
}

function hideStore() {
  closeDonationModal();
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

function updateGameOverLeaderboardNotice(message = '') {
  const notice = document.getElementById('gameOverLeaderboardNotice');
  if (!notice) return;

  const text = String(message || '').trim();
  notice.textContent = text;
  notice.hidden = text.length === 0;
}

function displayLeaderboard(leaderboard, playerPosition) {
  const { userWallet = null, primaryId = null } = getLeaderboardIdentity();
  const rows = [];

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
      const empty = document.createElement('div');
      empty.className = 'lb-empty';
      empty.textContent = 'No results';
      rows.push(empty);
    } else {
      sorted.forEach((entry, idx) => {
        const score = getEntryScore(entry);
        const isMe = entry.wallet === userWallet || entry.wallet === primaryId;

        let rankClass = '';
        if (idx === 0) rankClass = 'gold';
        else if (idx === 1) rankClass = 'silver';
        else if (idx === 2) rankClass = 'bronze';

        const rowClass = isMe ? 'lb-row lb-row--me' : 'lb-row';

        // Use displayName from backend, fallback to wallet formatting.
        let name = '';
        if (entry.displayName) {
          name = String(entry.displayName);
        } else if (entry.wallet && entry.wallet.startsWith('0x')) {
          name = `${entry.wallet.slice(0, 6)}...${entry.wallet.slice(-4)}`;
        } else if (entry.wallet) {
          name = entry.wallet.length > 14 ? `${entry.wallet.slice(0, 10)}...` : entry.wallet;
        } else {
          name = 'Unknown';
        }

        const row = document.createElement('div');
        row.className = rowClass;

        const rank = document.createElement('span');
        rank.className = `lb-rank ${rankClass}`.trim();
        rank.textContent = `#${idx + 1}`;

        const wallet = document.createElement('span');
        wallet.className = 'lb-wallet';
        wallet.textContent = `${name}${isMe ? ' 👤' : ''}`;

        const scoreEl = document.createElement('span');
        scoreEl.className = 'lb-score';
        scoreEl.append(
          createIconAtlas({
            width: 16,
            height: 16,
            backgroundSize: '80px auto',
            backgroundPosition: '-64px -16px',
            marginRight: 4
          }),
          document.createTextNode(score.toLocaleString())
        );

        row.append(rank, wallet, scoreEl);
        rows.push(row);
      });
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'lb-empty';
    empty.textContent = 'No data';
    rows.push(empty);
  }

  const startList = document.getElementById('startLeaderboardList');
  const goList = document.getElementById('gameOverLeaderboardList');
  if (startList) {
    clearNode(startList);
    rows.forEach((row) => startList.append(row.cloneNode(true)));
  }
  if (goList) {
    clearNode(goList);
    rows.forEach((row) => goList.append(row.cloneNode(true)));
  }
}

export {
  showBonusText,
  showStore,
  hideStore,
  updateUI,
  showLeaderboardSkeletons,
  displayLeaderboard,
  updateGameOverLeaderboardNotice
};
