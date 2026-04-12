import { CONFIG } from './config.js';
import { DOM, gameState, player } from './state.js';
import { syncAllAudioUI } from './audio.js';
import { getAuthStateSnapshot, hasWalletAuthSession } from './auth.js';
import { applyStoreDefaultLockState, loadPlayerUpgrades, updateStoreUI, setActiveStoreTab, closeDonationModal, isStoreAvailable, isUnauthRuntimeMode, getStoreStateSnapshot } from './store.js';
import { createElement, createIconAtlas, clearNode } from './dom-render.js';
import { showStoreScreen, hideStoreScreen } from './screens.js';
import { logger } from './logger.js';
import { notifyWarn } from './notifier.js';

function showBonusText(text) {
  gameState.bonusText = text;
  gameState.bonusTextTimer = 90;
}

function showStore() {
  if (!isStoreAvailable()) {
    notifyWarn(isUnauthRuntimeMode() ? "🛒 Store is unavailable in browser mode" : "🔗 Connect wallet first!");
    return;
  }

  if (!hasWalletAuthSession() && !isUnauthRuntimeMode()) {
    notifyWarn("🔗 Connect wallet first!");
    return;
  }

  showStoreScreen();

  syncAllAudioUI();
  applyStoreDefaultLockState();
  setActiveStoreTab('upgrade');
  const { isStoreDataLoading } = getStoreStateSnapshot();
  if (!isStoreDataLoading) {
    loadPlayerUpgrades().then(() => { updateStoreUI(); });
  }
  logger.info("🛒 Store opened");
}

function hideStore() {
  closeDonationModal();
  hideStoreScreen();
  logger.info("🛒 Store closed");
}

function updateUI() {
  gameState.uiUpdateFrame++;

  DOM.distanceVal.textContent = Math.floor(gameState.distance);
  DOM.scoreVal.textContent = Math.floor(gameState.score);

  if (gameState.uiUpdateFrame % 5 === 0) {
    DOM.shieldVal.textContent = player.shieldCount > 0 ? String(player.shieldCount) : "✗";
    const x2Active = gameState.baseMultiplier > 1 && gameState.x2Timer > 0;
    const invertActive = player.invertActive && gameState.invertScoreMultiplier > 1;
    const totalMultiplier = (x2Active ? gameState.baseMultiplier : 1) * (invertActive ? gameState.invertScoreMultiplier : 1);
    if (x2Active || invertActive) {
      const markers = [];
      if (x2Active) markers.push(`X2 ${gameState.x2Timer.toFixed(1)}s`);
      if (invertActive) markers.push(`INV ${player.invertTimer.toFixed(1)}s`);
      DOM.multiplierVal.textContent = `x${Number(totalMultiplier.toFixed(2))} (${markers.join(' · ')})`;
    } else {
      DOM.multiplierVal.textContent = "x1";
    }
    DOM.speedVal.textContent = (gameState.speed / CONFIG.SPEED_START).toFixed(2);
  }

  if (gameState.uiUpdateFrame % 10 === 0) {
    DOM.magnetVal.textContent = player.magnetActive ? `✓ ${player.magnetTimer.toFixed(1)}s` : "OFF";
    DOM.invertVal.textContent = player.invertActive ? `INV ${player.invertTimer.toFixed(1)}s` : "OK";
    DOM.spinVal.textContent = gameState.spinCooldown > 0 ? `⏳ ${(gameState.spinCooldown / 60).toFixed(1)}s` : "✓";
    DOM.goldVal.textContent = gameState.goldCoins;
    DOM.silverVal.textContent = gameState.silverCoins;
  }
}

/* ===== LEADERBOARD ===== */

function createLeaderboardSkeletonRow() {
  return createElement('div', {
    className: 'skeleton-row',
    children: [
      createElement('div', { className: 'skeleton-block skeleton-rank' }),
      createElement('div', { className: 'skeleton-block skeleton-wallet' }),
      createElement('div', { className: 'skeleton-block skeleton-score' })
    ]
  });
}

function renderNodeCopies(target, nodes) {
  if (!target) return;
  clearNode(target);
  nodes.forEach((node) => target.append(node.cloneNode(true)));
}

function showLeaderboardSkeletons() {
  const skeletonRows = Array.from({ length: 5 }, () => createLeaderboardSkeletonRow());

  renderNodeCopies(DOM.startLeaderboardList, skeletonRows);
  renderNodeCopies(DOM.gameOverLeaderboardList, skeletonRows);
}

function updateGameOverLeaderboardNotice(message = '') {
  const notice = DOM.gameOverLeaderboardNotice;
  if (!notice) return;

  const text = String(message || '').trim();
  notice.textContent = text;
  notice.hidden = text.length === 0;
}

function displayLeaderboard(leaderboard, playerPosition) {
  const { userWallet = null, primaryId = null } = getAuthStateSnapshot();
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

  renderNodeCopies(DOM.startLeaderboardList, rows);
  renderNodeCopies(DOM.gameOverLeaderboardList, rows);
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
