import { trackAnalyticsEvent } from './analytics.js';

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
      rides_left: params.ridesLeft,
      source: params.source || 'unknown',
    };
    trackAnalyticsEvent('run_started', payload);
    trackAnalyticsEvent('game_start', {
      authenticated: Boolean(params.isAuthorized),
      mode: params.mode,
      run_index: params.runIndex,
      difficulty_segment: params.difficultySegment,
      rides_left: params.ridesLeft,
    });
  },

  runFinished(params = {}) {
    const payload = {
      score: params.score,
      distance: params.distance,
      coins_gold: params.coinsGold,
      coins_silver: params.coinsSilver,
      duration_sec: params.durationSec,
      death_reason: params.deathReason,
      had_shield: params.hadShield || false,
    };
    trackAnalyticsEvent('run_finished', payload);
    trackAnalyticsEvent('game_end', {
      reason: params.deathReason,
      run_duration: params.durationSec,
      score: params.score,
      distance: params.distance,
      gold_coins: params.coinsGold,
      silver_coins: params.coinsSilver,
      run_index: params.runIndex,
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
      player_rank: params.playerRank,
      best_score: params.bestScore,
    });
  },

  donationSuccess(params = {}) {
    trackAnalyticsEvent('donation_success', {
      amount_usd: params.amountUsd,
      currency: params.currency,
      source: params.source,
    });
  },
};
