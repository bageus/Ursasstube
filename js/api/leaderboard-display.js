import { buildBackendUrl } from '../config.js';
import { getAuthStateSnapshot } from '../features/auth/index.js';
import { getRankBucket, validatePlayerInsights } from '../game/leaderboard-insights.js';
import { logger } from '../logger.js';
import { requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ } from '../request.js';
import { displayLeaderboard, setGameOverPrompt, showLeaderboardSkeletons } from '../ui.js';

function buildBackendApiUrl(pathname) {
  return new URL(buildBackendUrl(pathname));
}
async function loadAndDisplayLeaderboard(options = {}) {
  const runToken = options?.runToken ?? null;
  const { userWallet = '' } = getAuthStateSnapshot();
  showLeaderboardSkeletons();
  try {
    const normalizedWallet = String(userWallet || '').trim();
    const leaderboardUrl = buildBackendApiUrl('/api/leaderboard/top');
    if (normalizedWallet) {
      leaderboardUrl.searchParams.set('wallet', normalizedWallet);
      leaderboardUrl.searchParams.set('v', '2');
    }

    /** @type {{ ok: boolean, status: number, data: LeaderboardTopResponseV1|LeaderboardTopResponseV2 }} */
    const { ok, data } = await requestJsonResult(leaderboardUrl.toString(), REQUEST_PROFILE_LEADERBOARD_READ);

    let playerInsights = null;
    let insightsReason = normalizedWallet ? 'no_data' : 'no_wallet';

    if (ok) {
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
      const gameOverPrompt = data?.gameOverPrompt && typeof data.gameOverPrompt === 'object' ? data.gameOverPrompt : null;
      if (gameOverPrompt) setGameOverPrompt(gameOverPrompt, { source: 'save', runToken });
      displayLeaderboard(data?.leaderboard, data?.playerPosition, {
        playerInsights,
        insightsReason,
        rankBucket,
        gameOverPrompt,
        promptSource: 'save',
        runToken
      });
      return { ok: true, playerInsights, insightsReason, rankBucket };
    }

    displayLeaderboard([], null, { insightsReason: normalizedWallet ? 'api_error' : 'no_wallet', rankBucket: 'unknown' });
    return { ok: false, playerInsights: null, insightsReason: normalizedWallet ? 'api_error' : 'no_wallet', rankBucket: 'unknown' };
  } catch (e) {
    logger.warn("⚠️ Leaderboard unavailable:", e);
    displayLeaderboard([], null, { insightsReason: 'api_error', rankBucket: 'unknown' });
    return { ok: false, playerInsights: null, insightsReason: 'api_error', rankBucket: 'unknown' };
  }
}
