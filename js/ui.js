import { CONFIG } from './config.js';
import { DOM, gameState, player } from './state.js';
import { syncAllAudioUI } from './audio.js';
import { getAuthStateSnapshot, hasWalletAuthSession, hasAuthenticatedSession } from './auth.js';
import { applyStoreDefaultLockState, loadPlayerUpgrades, updateStoreUI, setActiveStoreTab, closeDonationModal, isStoreAvailable, isUnauthRuntimeMode, getStoreStateSnapshot } from './store.js';
import { createElement, createIconAtlas, clearNode } from './dom-render.js';
import { showStoreScreen, hideStoreScreen } from './screens.js';
import { logger } from './logger.js';
import { notifyWarn } from './notifier.js';
import { trackAnalyticsEvent } from './analytics.js';

const uiTextCache = {
  distance: '',
  score: '',
  shield: '',
  multiplier: '',
  speed: '',
  magnet: '',
  invert: '',
  spin: '',
  gold: '',
  silver: ''
};
const leaderboardSnapshot = {
  entries: [],
  playerPosition: null,
  playerInsights: null,
  insightsReason: null,
  rankBucket: 'unknown',
  previewPrompt: null,
  savePrompt: null,
  finalPromptSource: 'fallback',
  promptRunToken: null
};

function setTextIfChanged(node, cacheKey, value) {
  if (!node) return;
  const nextValue = String(value);
  if (uiTextCache[cacheKey] === nextValue) return;
  node.textContent = nextValue;
  uiTextCache[cacheKey] = nextValue;
}

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
  trackAnalyticsEvent('store_opened', {
    coins_gold: Number(gameState?.goldCoins || 0)
  });
}

function hideStore() {
  closeDonationModal();
  hideStoreScreen();
  logger.info("🛒 Store closed");
}

function updateUI() {
  const formatSecondsCompact = (seconds) => `${Math.max(0, Math.ceil(Number(seconds) || 0))}s`;

  gameState.uiUpdateFrame++;

  setTextIfChanged(DOM.distanceVal, 'distance', Math.floor(gameState.distance));
  setTextIfChanged(DOM.scoreVal, 'score', Math.floor(gameState.score));

  if (gameState.uiUpdateFrame % 5 === 0) {
    setTextIfChanged(DOM.shieldVal, 'shield', player.shieldCount > 0 ? String(player.shieldCount) : "✗");
    const x2Active = gameState.baseMultiplier > 1 && gameState.x2Timer > 0;
    const invertActive = player.invertActive && gameState.invertScoreMultiplier > 1;
    const totalMultiplier = (x2Active ? gameState.baseMultiplier : 1) * (invertActive ? gameState.invertScoreMultiplier : 1);
    if (x2Active || invertActive) {
      const markers = [];
      if (x2Active) markers.push(`X2 ${formatSecondsCompact(gameState.x2Timer)}`);
      if (invertActive) markers.push(`INV ${formatSecondsCompact(player.invertTimer)}`);
      setTextIfChanged(DOM.multiplierVal, 'multiplier', `x${Number(totalMultiplier.toFixed(2))} (${markers.join(' · ')})`);
    } else {
      setTextIfChanged(DOM.multiplierVal, 'multiplier', "x1");
    }
    setTextIfChanged(DOM.speedVal, 'speed', (gameState.speed / CONFIG.SPEED_START).toFixed(1));
  }

  if (gameState.uiUpdateFrame % 10 === 0) {
    setTextIfChanged(DOM.magnetVal, 'magnet', player.magnetActive ? `✓ ${formatSecondsCompact(player.magnetTimer)}` : "OFF");
    setTextIfChanged(DOM.invertVal, 'invert', player.invertActive ? `INV ${formatSecondsCompact(player.invertTimer)}` : "OK");
    setTextIfChanged(DOM.spinVal, 'spin', gameState.spinCooldown > 0 ? `⏳ ${formatSecondsCompact(gameState.spinCooldown / 60)}` : "✓");
    setTextIfChanged(DOM.goldVal, 'gold', gameState.goldCoins);
    setTextIfChanged(DOM.silverVal, 'silver', gameState.silverCoins);
  }
}

/* ===== LEADERBOARD ===== */


function setGameOverInsightsLoading(isLoading) {
  if (!DOM.goComparison && !DOM.goNextTarget) return;
  const hook = DOM.goComparison?.parentElement || DOM.goNextTarget?.parentElement;
  if (!hook) return;
  hook.classList.toggle('go-hook-loading', Boolean(isLoading));
}

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

function formatLeaderboardName(entry = {}) {
  if (entry.displayName) return String(entry.displayName);
  if (entry.wallet && entry.wallet.startsWith('0x')) {
    return `${entry.wallet.slice(0, 6)}...${entry.wallet.slice(-4)}`;
  }
  if (entry.wallet) {
    return entry.wallet.length > 14 ? `${entry.wallet.slice(0, 10)}...` : entry.wallet;
  }
  return 'Unknown';
}

function createLeaderboardRow(entry, idx, { isMe = false, isDimmed = false, rankOverride = null } = {}) {
  const score = parseInt(entry?.bestScore ?? entry?.score, 10) || 0;
  const rankPos = Number.isFinite(rankOverride) ? rankOverride : (idx + 1);
  let rankClass = '';
  if (rankPos === 1) rankClass = 'gold';
  else if (rankPos === 2) rankClass = 'silver';
  else if (rankPos === 3) rankClass = 'bronze';

  const row = document.createElement('div');
  row.className = `lb-row${isMe ? ' lb-row--me' : ''}${isDimmed ? ' lb-row--dimmed' : ''}`;

  const rank = document.createElement('span');
  rank.className = `lb-rank ${rankClass}`.trim();
  rank.textContent = `#${rankPos}`;

  const wallet = document.createElement('span');
  wallet.className = 'lb-wallet';
  wallet.textContent = `${formatLeaderboardName(entry)}${isMe ? ' 👤' : ''}`;

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
  return row;
}

function createLeaderboardGapRow() {
  const row = document.createElement('div');
  row.className = 'lb-row lb-row--dimmed';

  const rank = document.createElement('span');
  rank.className = 'lb-rank';
  rank.textContent = '…';

  const wallet = document.createElement('span');
  wallet.className = 'lb-wallet';
  wallet.textContent = '…';

  const score = document.createElement('span');
  score.className = 'lb-score';
  score.textContent = '…';

  row.append(rank, wallet, score);
  return row;
}

function buildAroundPlayerRowsFromTopEntries(entries, playerPosition) {
  const rank = Number(playerPosition);
  if (!Number.isFinite(rank) || rank <= 1 || !Array.isArray(entries) || entries.length === 0) return [];

  const aroundRows = [];
  const above = entries[rank - 2];
  const me = entries[rank - 1];
  const below = entries[rank];

  if (above) {
    aroundRows.push(createLeaderboardRow(above, 0, {
      isMe: false,
      rankOverride: rank - 1
    }));
  }
  if (me) {
    aroundRows.push(createLeaderboardRow(me, 0, {
      isMe: true,
      rankOverride: rank
    }));
  }
  if (below) {
    aroundRows.push(createLeaderboardRow(below, 0, {
      isMe: false,
      rankOverride: rank + 1
    }));
  }
  return aroundRows;
}

function resolveGameOverPrompt() {
  return leaderboardSnapshot.savePrompt ?? leaderboardSnapshot.previewPrompt ?? null;
}

function beginGameOverPromptRun(runToken) {
  leaderboardSnapshot.promptRunToken = runToken ?? null;
  leaderboardSnapshot.previewPrompt = null;
  leaderboardSnapshot.savePrompt = null;
  leaderboardSnapshot.finalPromptSource = 'fallback';
}

function setGameOverPrompt(prompt, options = {}) {
  const source = options?.source === 'preview' ? 'preview' : 'save';
  const runToken = options?.runToken ?? null;
  if (runToken !== null && leaderboardSnapshot.promptRunToken !== null && runToken !== leaderboardSnapshot.promptRunToken) {
    return false;
  }

  const normalizedPrompt = prompt && typeof prompt === 'object' ? { ...prompt } : null;
  if (!normalizedPrompt) return false;

  if (source === 'preview') {
    if (leaderboardSnapshot.savePrompt) return false;
    leaderboardSnapshot.previewPrompt = normalizedPrompt;
    leaderboardSnapshot.finalPromptSource = 'preview';
    return true;
  }

  leaderboardSnapshot.savePrompt = normalizedPrompt;
  leaderboardSnapshot.finalPromptSource = 'save';
  return true;
}

function renderGameOverLeaderboard(rows) {
  renderNodeCopies(DOM.gameOverLeaderboardList, rows);
}

function displayLeaderboard(leaderboard, playerPosition, options = {}) {
  const previousRank = Number.isFinite(Number(leaderboardSnapshot.playerPosition))
    ? Number(leaderboardSnapshot.playerPosition)
    : null;
  const { userWallet = null, primaryId = null } = getAuthStateSnapshot();
  const startRows = [];
  const gameOverRows = [];
  leaderboardSnapshot.playerInsights = options.playerInsights || null;
  leaderboardSnapshot.insightsReason = options.insightsReason || null;
  leaderboardSnapshot.rankBucket = options.rankBucket || 'unknown';
  if (options.gameOverPrompt && typeof options.gameOverPrompt === 'object') {
    setGameOverPrompt(options.gameOverPrompt, { source: options.promptSource || 'save', runToken: options.runToken ?? null });
  }
  const promptToRender = resolveGameOverPrompt();

  if (Array.isArray(leaderboard) && leaderboard.length > 0) {
    const getEntryScore = (entry) => {
      if (!entry || typeof entry !== 'object') return 0;
      // Backend historically used both `bestScore` and `score` fields.
      return parseInt(entry.bestScore ?? entry.score) || 0;
    };

    const sorted = leaderboard
      .filter(entry => getEntryScore(entry) > 0)
      .sort((a, b) => getEntryScore(b) - getEntryScore(a));
    leaderboardSnapshot.entries = sorted.map((entry) => ({
      ...entry,
      score: getEntryScore(entry)
    }));
    leaderboardSnapshot.playerPosition = Number.isFinite(Number(playerPosition)) ? Number(playerPosition) : null;
    if (previousRank && leaderboardSnapshot.playerPosition && previousRank !== leaderboardSnapshot.playerPosition) {
      trackAnalyticsEvent('leaderboard_rank_changed', {
        old_rank: previousRank,
        new_rank: leaderboardSnapshot.playerPosition,
        best_score: Number(options?.playerInsights?.bestScore || 0)
      });
    }
    const topTen = sorted.slice(0, 10);

    if (topTen.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lb-empty';
      empty.textContent = 'No results';
      startRows.push(empty);
      gameOverRows.push(empty.cloneNode(true));
    } else {
      topTen.forEach((entry, idx) => {
        const isMe = entry.wallet === userWallet || entry.wallet === primaryId;
        startRows.push(createLeaderboardRow(entry, idx, { isMe, rankOverride: idx + 1 }));
      });

      const promptSliceRows = Array.isArray(promptToRender?.leaderboardSlice?.rows)
        ? promptToRender.leaderboardSlice.rows
        : [];
      const shouldUseAroundSlice = hasAuthenticatedSession()
        && promptSliceRows.length > 0
        && String(promptToRender?.leaderboardSlice?.mode || '') === 'around_player';

      const shouldAppendAroundPlayer = hasAuthenticatedSession()
        && Number.isFinite(Number(playerPosition))
        && Number(playerPosition) > topTen.length;

      topTen.forEach((entry, idx) => {
        const isMe = entry.wallet === userWallet || entry.wallet === primaryId;
        gameOverRows.push(createLeaderboardRow(entry, idx, { isMe, rankOverride: idx + 1 }));
      });

      if (shouldAppendAroundPlayer) {
        gameOverRows.push(createLeaderboardGapRow());
      }

      if (shouldUseAroundSlice) {
        promptSliceRows.forEach((sliceRow, idx) => {
          const rowScore = Number(sliceRow.bestScore ?? sliceRow.score ?? 0);
          gameOverRows.push(createLeaderboardRow({
            ...sliceRow,
            score: rowScore
          }, idx, {
            isMe: Boolean(sliceRow.isCurrentPlayerRow),
            isDimmed: Boolean(sliceRow.isDimmed),
            rankOverride: Number(sliceRow.position) || null
          }));
        });
      } else if (shouldAppendAroundPlayer) {
        const aroundRows = buildAroundPlayerRowsFromTopEntries(sorted, Number(playerPosition));
        aroundRows.forEach((row) => gameOverRows.push(row));
      }

      if (shouldAppendAroundPlayer) {
        gameOverRows.push(createLeaderboardGapRow());
      }
    }
  } else {
    leaderboardSnapshot.entries = [];
    leaderboardSnapshot.playerPosition = null;
    const empty = document.createElement('div');
    empty.className = 'lb-empty';
    empty.textContent = 'No data';
    startRows.push(empty);
    gameOverRows.push(empty.cloneNode(true));
  }

  renderNodeCopies(DOM.startLeaderboardList, startRows);
  renderGameOverLeaderboard(gameOverRows);
}

function getLeaderboardSnapshot() {
  const promptToRender = resolveGameOverPrompt();
  return {
    entries: Array.isArray(leaderboardSnapshot.entries) ? [...leaderboardSnapshot.entries] : [],
    playerPosition: leaderboardSnapshot.playerPosition,
    playerInsights: leaderboardSnapshot.playerInsights,
    insightsReason: leaderboardSnapshot.insightsReason,
    rankBucket: leaderboardSnapshot.rankBucket,
    previewPrompt: leaderboardSnapshot.previewPrompt ? { ...leaderboardSnapshot.previewPrompt } : null,
    savePrompt: leaderboardSnapshot.savePrompt ? { ...leaderboardSnapshot.savePrompt } : null,
    finalPromptSource: leaderboardSnapshot.finalPromptSource,
    gameOverPrompt: promptToRender ? { ...promptToRender } : null
  };
}

export {
  showBonusText,
  showStore,
  hideStore,
  updateUI,
  showLeaderboardSkeletons,
  displayLeaderboard,
  updateGameOverLeaderboardNotice,
  getLeaderboardSnapshot,
  setGameOverInsightsLoading,
  setGameOverPrompt,
  beginGameOverPromptRun
};
