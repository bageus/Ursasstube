import { trackAnalyticsEvent } from '../analytics.js';

function toFiniteAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getBalanceDelta(previousBalance = {}, nextBalance = {}) {
  const currencies = new Set([...Object.keys(previousBalance || {}), ...Object.keys(nextBalance || {})]);
  const deltas = [];

  for (const currency of currencies) {
    const previousValue = toFiniteAmount(previousBalance?.[currency]);
    const nextValue = toFiniteAmount(nextBalance?.[currency]);
    const spentAmount = Math.max(0, previousValue - nextValue);
    if (spentAmount > 0) {
      deltas.push({ currency, amount: spentAmount });
    }
  }

  return deltas;
}

const UPGRADE_VALUE_TAGS = Object.freeze({
  shield: 'survival',
  shield_capacity: 'survival',
  spin_alert: 'survival',
  radar_obstacles: 'survival',
  radar_gold: 'economy',
  x2_duration: 'score',
  score_plus_300_mult: 'score',
  score_plus_500_mult: 'score',
  score_minus_300_mult: 'economy',
  score_minus_500_mult: 'economy',
  invert_score: 'score',
  speed_up_mult: 'score',
  speed_down_mult: 'survival',
  magnet_duration: 'economy',
  spin_cooldown: 'score',
});

function getUpgradeValueTag(upgradeKey) {
  return UPGRADE_VALUE_TAGS[upgradeKey] || 'general';
}

function trackUpgradePurchaseAnalytics({
  upgradeKey,
  tier,
  levelBefore = Number(tier),
  previousBalance,
  nextBalance
}) {
  const deltas = getBalanceDelta(previousBalance, nextBalance);
  const resolvedLevelBefore = Math.max(0, Number(levelBefore) || 0);
  const resolvedLevelAfter = Math.max(resolvedLevelBefore + 1, Number(tier) + 1 || 0);
  const valueTag = getUpgradeValueTag(upgradeKey);

  trackAnalyticsEvent('upgrade_purchase', {
    upgrade_key: upgradeKey,
    tier: Number(tier),
    next_level: Number(tier) + 1,
    level_before: resolvedLevelBefore,
    level_after: resolvedLevelAfter,
    value_tag: valueTag,
    success: true
  });

  for (const { currency, amount } of deltas) {
    trackAnalyticsEvent('currency_spent', {
      source: 'store_upgrade',
      upgrade_key: upgradeKey,
      level_after: resolvedLevelAfter,
      value_tag: valueTag,
      currency,
      amount
    });
  }

  return deltas;
}

export {
  getBalanceDelta,
  trackUpgradePurchaseAnalytics
};
