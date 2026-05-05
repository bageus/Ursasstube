import { trackAnalyticsEvent } from './analytics.js';


function toNumberOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}


function nextRunCountFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;

  const runsCount = Number(window.localStorage.getItem('runs_count') || 0);
  const safeRunsCount = Number.isFinite(runsCount) && runsCount >= 0 ? runsCount : 0;
  const nextRunsCount = safeRunsCount + 1;
  window.localStorage.setItem('runs_count', String(nextRunsCount));
  return nextRunsCount;
}

export const analytics = {
  appOpened(payload = {}) {
    trackAnalyticsEvent('app_opened', payload);
  },

  onboardingStarted() {
    trackAnalyticsEvent('onboarding_started');
  },

  onboardingCompleted(payload = {}) {
    trackAnalyticsEvent('onboarding_completed', payload);
  },

  runStarted(params = {}) {
    const runNumber = nextRunCountFromStorage();
    const payload = {
      is_authorized: Boolean(params.isAuthorized),
      rides_left: toNumberOrUndefined(params.ridesLeft),
      source: params.source || 'unknown',
      run_number: runNumber,
    };
    trackAnalyticsEvent('run_started', payload);
    if (runNumber === 2) {
      trackAnalyticsEvent('second_run_started', {
        run_number: 2,
      });
    }
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

  secondRunStarted(payload = {}) {
    trackAnalyticsEvent('second_run_started', payload);
  },

  walletConnectStarted(payload = {}) {
    trackAnalyticsEvent('wallet_connect_started', payload);
  },

  walletConnectSuccess(payload = {}) {
    const normalizedPayload = (payload && typeof payload === 'object')
      ? payload
      : { wallet_type: payload };
    trackAnalyticsEvent('wallet_connect_success', normalizedPayload);
  },

  walletConnectFailed(payload = {}) {
    trackAnalyticsEvent('wallet_connect_failed', payload);
  },

  leaderboardOpened(params = {}) {
    trackAnalyticsEvent('leaderboard_opened', {
      player_rank: toNumberOrUndefined(params.playerRank),
      best_score: toNumberOrUndefined(params.bestScore),
    });
  },

  donationSuccess(params = {}) {
    const normalizedCurrency = String(params.currency || '').trim().toUpperCase();
    trackAnalyticsEvent('donation_success', {
      amount_usd: toNumberOrUndefined(params.amountUsd),
      currency: normalizedCurrency || params.currency,
      source: params.source,
    });
  },

  storeOpened(payload = {}) {
    trackAnalyticsEvent('store_opened', payload);
  },

  upgradePurchased(payload = {}) {
    trackAnalyticsEvent('upgrade_purchased', payload);
  },

  donationStarted(payload = {}) {
    trackAnalyticsEvent('donation_started', payload);
  },

  donationFailed(payload = {}) {
    trackAnalyticsEvent('donation_failed', payload);
  },

  shareResultClicked(params = {}) {
    trackAnalyticsEvent('share_result_clicked', {
      context: params.context || 'unknown',
      source: params.source || 'share_result_button',
    });
  },


  shareResultApiSuccess(payload = {}) {
    trackAnalyticsEvent('share_result_api_success', payload);
  },

  shareResultApiError(payload = {}) {
    trackAnalyticsEvent('share_result_api_error', payload);
  },

  shareIntentOpened(payload = {}) {
    trackAnalyticsEvent('share_intent_opened', payload);
  },

  
  referralCodeCopied(payload = {}) { trackAnalyticsEvent('referral_code_copied', payload); },
  referralWebLinkCopied(payload = {}) { trackAnalyticsEvent('referral_web_link_copied', payload); },
  referralTelegramLinkCopied(payload = {}) { trackAnalyticsEvent('referral_telegram_link_copied', payload); },
  referralCodeApplyClicked(payload = {}) { trackAnalyticsEvent('referral_code_apply_clicked', payload); },
  referralCodeApplySuccess(payload = {}) { trackAnalyticsEvent('referral_code_apply_success', payload); },
  referralCodeApplyError(payload = {}) { trackAnalyticsEvent('referral_code_apply_error', payload); },
// Deprecated typo aliases. Do not use in new code.
  donationSuccsses(payload = {}) {
    this.donationSuccess(payload);
  },

  donationSuccssesUsdt(payload = {}) {
    this.donationSuccess({ ...payload, currency: payload.currency || 'USDT' });
  },

  donationSuccssesStars(payload = {}) {
    this.donationSuccess({ ...payload, currency: payload.currency || 'STARS' });
  },

  resultSuccsses(payload = {}) {
    this.shareResultClicked(payload);
  },
};
