import { hasWalletAuthSession } from '../../features/auth/index.js';
import { logger } from '../../logger.js';
import { notifySuccess } from '../../notifier.js';
import { getLeaderboardSnapshot } from '../../ui.js';

// ===== RANK WATCHER =====

function getRankToastSessionKey(primaryId) {
  return `rankToastShown_${primaryId}`;
}

function isValidDelta(delta) {
  return delta != null && Number.isFinite(Number(delta)) && Number(delta) > 0;
}

function buildTakeBackSub(snapshot, lostPosition) {
  if (lostPosition === null || !(lostPosition > 0)) return null;
  const list = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  const targetScore = Number(list[lostPosition - 1]?.score ?? 0);
  if (Number.isFinite(targetScore) && targetScore > 0) {
    return `+${(targetScore + 1).toLocaleString('en-US')} to take back`;
  }
  return null;
}

function showRankLossToast(profile, primaryId) {
  if (!profile || !primaryId) {
    logger.debug('rank-loss toast: skip — no profile/primaryId');
    return;
  }
  if (!hasWalletAuthSession()) {
    logger.debug('rank-loss toast: skip — no wallet session');
    return;
  }
  if (typeof sessionStorage === 'undefined') {
    logger.debug('rank-loss toast: skip — sessionStorage unavailable');
    return;
  }

  const rankDelta = Number(profile?.rankDelta || 0);
  if (!(rankDelta > 0)) {
    logger.debug('rank-loss toast: skip — rankDelta', rankDelta);
    return;
  }

  const sessionKey = getRankToastSessionKey(primaryId);
  if (sessionStorage.getItem(sessionKey)) {
    logger.debug('rank-loss toast: skip — already shown this session');
    return;
  }

  const currentRank = Number(profile?.rank || 0);
  const lostPosition = currentRank > 0 && rankDelta > 0 ? currentRank - rankDelta : null;

  let sub = null;
  if (lostPosition !== null) {
    const snapshot = getLeaderboardSnapshot();
    sub = buildTakeBackSub(snapshot, lostPosition) ?? `Take back #${lostPosition}`;
  }

  notifySuccess(`🏃 You lost ${rankDelta} position${rankDelta === 1 ? '' : 's'}`, { sub });
  sessionStorage.setItem(sessionKey, '1');
}

export {
  buildTakeBackSub,
  showRankLossToast
};
