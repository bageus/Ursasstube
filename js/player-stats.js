import { DOM } from './state.js';
import { logger } from './logger.js';

function resolveVisibleGold(profile) {
  const canonicalGold = Number(profile?.gold);
  if (Number.isFinite(canonicalGold)) return canonicalGold;
  const fallbackGold = Number(profile?.totalGoldCoins);
  return Number.isFinite(fallbackGold) ? fallbackGold : 0;
}

function applyWalletProfile(profile) {
  const rankEl = DOM.walletRank;
  const bestEl = DOM.walletBest;
  const goldEl = DOM.walletGold;
  const silverEl = DOM.walletSilver;
  const rank = profile?.rank ?? profile?.position ?? null;
  const bestScore = Number(profile?.bestScore || 0);

  if (rankEl) {
    const hasRank = Number.isFinite(Number(rank)) && Number(rank) > 0;
    rankEl.textContent = hasRank ? `#${rank}` : (bestScore > 0 ? '#' : '—');
  }
  if (bestEl) bestEl.textContent = String(bestScore);
  if (goldEl) goldEl.textContent = String(resolveVisibleGold(profile));
  if (silverEl) silverEl.textContent = String(Number(profile?.totalSilverCoins || 0));
  if (DOM.walletInfo) DOM.walletInfo.classList.add('visible');
}

async function runRefreshPlayerStats({
  hasAuthenticatedSession,
  getPrimaryAuthIdentifier,
  resetWalletPlayerUI,
  fetchMyProfile,
  loadAndDisplayLeaderboard,
  refreshLeaderboard = false,
  leaderboardCooldownMs = 5000,
  getLastLeaderboardRefreshAt,
  setLastLeaderboardRefreshAt
}) {
  const primaryId = getPrimaryAuthIdentifier();
  if (!hasAuthenticatedSession() || !primaryId) {
    try {
      DOM.walletInfo?.classList.remove('visible');
      resetWalletPlayerUI();
    } catch (e) {
      logger.warn('⚠️ Failed to reset wallet UI for unauthenticated user:', e);
    }
    return;
  }

  try {
    const profile = await fetchMyProfile();
    if (profile) applyWalletProfile(profile);
    else logger.warn('⚠️ refreshPlayerStats: profile not available');

    if (refreshLeaderboard) {
      const now = Date.now();
      const lastRefresh = Number(getLastLeaderboardRefreshAt?.() || 0);
      const cooldownMs = Math.max(0, Number(leaderboardCooldownMs) || 0);
      if ((now - lastRefresh) >= cooldownMs) {
        setLastLeaderboardRefreshAt?.(now);
        await loadAndDisplayLeaderboard();
      } else {
        logger.info('ℹ️ refreshPlayerStats: leaderboard refresh skipped by cooldown');
      }
    }
  } catch (e) {
    logger.warn('⚠️ refreshPlayerStats error:', e);
  }
}

export { runRefreshPlayerStats };
