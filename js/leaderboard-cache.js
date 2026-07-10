import { buildBackendUrl } from './config.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ } from './request.js';
import { DOM } from './state.js';
import { getAuthStateSnapshot } from './features/auth/index.js';
import { displayLeaderboard, setGameOverPrompt } from './ui.js';
import { validatePlayerInsights, getRankBucket } from './game/leaderboard-insights.js';
import { logger } from './logger.js';

const LEADERBOARD_CACHE_TTL_MS = 30000;

let cachedLeaderboard = null;
let leaderboardLoadPromise = null;
let silentPreloadInstalled = false;
let skeletonObserver = null;

function buildBackendApiUrl(pathname) {
  return new URL(buildBackendUrl(pathname));
}

function scheduleIdleTask(callback, timeout = 1500) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout });
    return;
  }

  setTimeout(callback, 0);
}

function getLeaderboardCacheKey() {
  const { userWallet = '' } = getAuthStateSnapshot();
  const normalizedWallet = String(userWallet || '').trim().toLowerCase();
  return normalizedWallet || 'anon';
}

function isCacheFresh(cache = cachedLeaderboard) {
  return Boolean(
    cache
    && cache.key === getLeaderboardCacheKey()
    && Date.now() - Number(cache.updatedAt || 0) < LEADERBOARD_CACHE_TTL_MS
  );
}

function suppressStartLeaderboardSkeletons() {
  const list = DOM.startLeaderboardList;
  if (!list) return;
  const children = Array.from(list.children || []);
  if (children.length === 0) return;
  const onlySkeletons = children.every((node) => node?.classList?.contains('skeleton-row'));
  if (onlySkeletons) list.replaceChildren();
}

function installStartSkeletonGuard() {
  if (typeof MutationObserver === 'undefined') return;
  const list = DOM.startLeaderboardList;
  if (!list || skeletonObserver) return;
  skeletonObserver = new MutationObserver(() => suppressStartLeaderboardSkeletons());
  skeletonObserver.observe(list, { childList: true });
  suppressStartLeaderboardSkeletons();
}

async function fetchLeaderboardData() {
  const { userWallet = '' } = getAuthStateSnapshot();
  const normalizedWallet = String(userWallet || '').trim();
  const leaderboardUrl = buildBackendApiUrl('/api/leaderboard/top');
  if (normalizedWallet) {
    leaderboardUrl.searchParams.set('wallet', normalizedWallet);
    leaderboardUrl.searchParams.set('v', '2');
  }

  const { ok, data } = await requestJsonResult(leaderboardUrl.toString(), REQUEST_PROFILE_LEADERBOARD_READ);
  let playerInsights = null;
  let insightsReason = normalizedWallet ? 'no_data' : 'no_wallet';

  if (!ok) {
    return {
      ok: false,
      data: null,
      playerInsights: null,
      insightsReason: normalizedWallet ? 'api_error' : 'no_wallet',
      rankBucket: 'unknown',
      gameOverPrompt: null
    };
  }

  const topInsights = validatePlayerInsights(data?.playerInsights);
  if (topInsights.ok) {
    playerInsights = topInsights.data;
    insightsReason = null;
  } else if (normalizedWallet) {
    try {
      const insightsUrl = buildBackendApiUrl('/api/leaderboard/insights');
      insightsUrl.searchParams.set('wallet', normalizedWallet);
      const insightsResult = await requestJsonResult(insightsUrl.toString(), REQUEST_PROFILE_LEADERBOARD_READ);
      if (insightsResult.ok) {
        const fallbackInsights = validatePlayerInsights(insightsResult.data?.playerInsights ?? insightsResult.data);
        if (fallbackInsights.ok) {
          playerInsights = fallbackInsights.data;
          insightsReason = null;
        } else {
          insightsReason = 'validation_error';
        }
      } else {
        insightsReason = 'api_error';
      }
    } catch (error) {
      logger.warn('⚠️ Leaderboard insights fallback error:', error);
      insightsReason = 'api_error';
    }
  }

  const rankBucket = getRankBucket(playerInsights?.rank ?? data?.playerPosition);
  const gameOverPrompt = data?.gameOverPrompt && typeof data.gameOverPrompt === 'object'
    ? data.gameOverPrompt
    : null;

  return {
    ok: true,
    data,
    playerInsights,
    insightsReason,
    rankBucket,
    gameOverPrompt
  };
}

function renderLeaderboardResult(result, { runToken = null } = {}) {
  if (!result?.ok || !result.data) return false;
  if (result.gameOverPrompt) setGameOverPrompt(result.gameOverPrompt, { source: 'save', runToken });
  displayLeaderboard(result.data?.leaderboard, result.data?.playerPosition, {
    playerInsights: result.playerInsights,
    insightsReason: result.insightsReason,
    rankBucket: result.rankBucket,
    gameOverPrompt: result.gameOverPrompt,
    promptSource: 'save',
    runToken
  });
  return true;
}

function renderCachedLeaderboard({ runToken = null } = {}) {
  if (!isCacheFresh()) return false;
  return renderLeaderboardResult(cachedLeaderboard.result, { runToken });
}

async function preloadLeaderboardSilently(options = {}) {
  const { force = false, render = true, runToken = null, source = 'startup' } = options || {};
  if (!force && isCacheFresh()) {
    if (render) renderCachedLeaderboard({ runToken });
    return cachedLeaderboard.result;
  }

  if (leaderboardLoadPromise) return leaderboardLoadPromise;

  leaderboardLoadPromise = (async () => {
    try {
      const result = await fetchLeaderboardData();
      if (result.ok) {
        cachedLeaderboard = {
          key: getLeaderboardCacheKey(),
          updatedAt: Date.now(),
          result
        };
        if (render) renderLeaderboardResult(result, { runToken });
      }
      return result;
    } catch (error) {
      logger.warn('⚠️ Silent leaderboard preload failed:', { source, error });
      return {
        ok: false,
        data: null,
        playerInsights: null,
        insightsReason: 'api_error',
        rankBucket: 'unknown',
        gameOverPrompt: null
      };
    } finally {
      leaderboardLoadPromise = null;
    }
  })();

  return leaderboardLoadPromise;
}

function installSilentLeaderboardPreload() {
  if (silentPreloadInstalled) return;
  silentPreloadInstalled = true;
  installStartSkeletonGuard();
  requestAnimationFrame(() => installStartSkeletonGuard());
  scheduleIdleTask(() => {
    preloadLeaderboardSilently({ source: 'startup_idle' }).catch((error) => {
      logger.warn('⚠️ Startup leaderboard preload failed:', error);
    });
  }, 1800);
}

export {
  installSilentLeaderboardPreload
};
