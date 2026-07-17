const SCORE_NODE_IDS = Object.freeze({
  rank: ['walletRank', 'pmRankNumber'],
  score: ['walletBest', 'pmBestScore']
});

let installed = false;
let latestLeaderboardSummary = null;
let leaderboardObserver = null;
let playerMenuObserver = null;

function parseDisplayInteger(value) {
  const digits = String(value ?? '').replace(/[^0-9-]/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function resolveTextFitMode(value) {
  const length = Array.from(String(value || '').trim()).length;
  if (length > 24) return 'tight';
  if (length > 16) return 'compact';
  return 'normal';
}

function readLeaderboardSummary(root) {
  const row = root?.querySelector?.('.lb-row--me');
  if (!row) return null;

  const rank = parseDisplayInteger(row.querySelector?.('.lb-rank')?.textContent);
  const score = parseDisplayInteger(row.querySelector?.('.lb-score')?.textContent);
  if (rank === null && score === null) return null;
  return { rank, score };
}

function setNodeText(documentRef, id, value) {
  const node = documentRef?.getElementById?.(id);
  if (!node || value === null || value === undefined) return false;
  const next = String(value);
  if (node.textContent === next) return false;
  node.textContent = next;
  return true;
}

function applyLeaderboardSummary(summary, documentRef = document) {
  if (!summary || !documentRef) return false;
  let changed = false;

  if (Number.isFinite(summary.rank) && summary.rank > 0) {
    for (const id of SCORE_NODE_IDS.rank) {
      changed = setNodeText(documentRef, id, `#${summary.rank}`) || changed;
    }
  }

  if (Number.isFinite(summary.score) && summary.score >= 0) {
    for (const id of SCORE_NODE_IDS.score) {
      changed = setNodeText(documentRef, id, Math.trunc(summary.score)) || changed;
    }
  }

  return changed;
}

function fitConnectedAccountButton(button) {
  if (!button) return 'normal';
  const label = String(button.textContent || '').trim();
  const mode = resolveTextFitMode(label);
  button.dataset.textFit = mode;
  if (label) button.title = label;
  return mode;
}

function synchronizePlayerUi(documentRef = document) {
  if (!documentRef) return null;
  const leaderboardRoot = documentRef.getElementById('startLeaderboardList');
  const currentSummary = readLeaderboardSummary(leaderboardRoot);
  if (currentSummary) latestLeaderboardSummary = currentSummary;
  if (latestLeaderboardSummary) applyLeaderboardSummary(latestLeaderboardSummary, documentRef);
  fitConnectedAccountButton(documentRef.getElementById('pmConnectXBtn'));
  return latestLeaderboardSummary;
}

function bindObservers(documentRef) {
  const leaderboardRoot = documentRef.getElementById('startLeaderboardList');
  if (leaderboardRoot && !leaderboardObserver && typeof MutationObserver !== 'undefined') {
    leaderboardObserver = new MutationObserver(() => synchronizePlayerUi(documentRef));
    leaderboardObserver.observe(leaderboardRoot, { childList: true, subtree: true, characterData: true });
  }

  const playerMenu = documentRef.getElementById('playerMenuOverlay');
  if (playerMenu && !playerMenuObserver && typeof MutationObserver !== 'undefined') {
    playerMenuObserver = new MutationObserver(() => synchronizePlayerUi(documentRef));
    playerMenuObserver.observe(playerMenu, { childList: true, subtree: true, characterData: true });
  }

  synchronizePlayerUi(documentRef);
}

function installPlayerUiConsistency() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindObservers(document), { once: true });
    return;
  }

  bindObservers(document);
}

export {
  applyLeaderboardSummary,
  fitConnectedAccountButton,
  installPlayerUiConsistency,
  parseDisplayInteger,
  readLeaderboardSummary,
  resolveTextFitMode
};
