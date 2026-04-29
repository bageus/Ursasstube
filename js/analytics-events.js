import { trackAnalyticsEvent } from './analytics.js';


function toNumberOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

export const analytics = {
  onboardingStarted() {
    trackAnalyticsEvent('onboarding_started');
  },

  onboardingCompleted() {
    trackAnalyticsEvent('onboarding_completed');
  },

  runStarted(params = {}) {
    const payload = {
      is_authorized: Boolean(params.isAuthorized),
      rides_left: toNumberOrUndefined(params.ridesLeft),
      source: params.source || 'unknown',
    };
    trackAnalyticsEvent('run_started', payload);
    trackAnalyticsEvent('game_start', {
      authenticated: Boolean(params.isAuthorized),
      mode: params.mode,
      run_index: toNumberOrUndefined(params.runIndex),
      difficulty_segment: params.difficultySegment,
      rides_left: toNumberOrUndefined(params.ridesLeft),
    });
  },

  runFinished(params = {}) {
    const payload = {
      score: toNumberOrUndefined(params.score),
      distance: toNumberOrUndefined(params.distance),
      coins_gold: toNumberOrUndefined(params.coinsGold),
      coins_silver: toNumberOrUndefined(params.coinsSilver),
      duration_sec: toNumberOrUndefined(params.durationSec),
      death_reason: params.deathReason,
      had_shield: params.hadShield || false,
    };
    trackAnalyticsEvent('run_finished', payload);
    trackAnalyticsEvent('game_end', {
      reason: params.deathReason,
      run_duration: toNumberOrUndefined(params.durationSec),
      score: toNumberOrUndefined(params.score),
      distance: toNumberOrUndefined(params.distance),
      gold_coins: toNumberOrUndefined(params.coinsGold),
      silver_coins: toNumberOrUndefined(params.coinsSilver),
      run_index: toNumberOrUndefined(params.runIndex),
      difficulty_segment: params.difficultySegment,
      ...params.extra,
    });
  },

  walletConnectStarted() {
    trackAnalyticsEvent('wallet_connect_started');
  },

  walletConnectSuccess(walletType) {
    trackAnalyticsEvent('wallet_connect_success', {
      wallet_type: walletType,
    });
  },

  leaderboardOpened(params = {}) {
    trackAnalyticsEvent('leaderboard_opened', {
      player_rank: toNumberOrUndefined(params.playerRank),
      best_score: toNumberOrUndefined(params.bestScore),
    });
  },

  donationSuccess(params = {}) {
    trackAnalyticsEvent('donation_success', {
      amount_usd: toNumberOrUndefined(params.amountUsd),
      currency: params.currency,
      source: params.source,
    });
  },
};
