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

function trackUpgradePurchaseAnalytics({
  upgradeKey,
  tier,
  previousBalance,
  nextBalance
}) {
  const deltas = getBalanceDelta(previousBalance, nextBalance);

  trackAnalyticsEvent('upgrade_purchase', {
    upgrade_key: upgradeKey,
    tier: Number(tier),
    next_level: Number(tier) + 1,
    success: true
  });

  for (const { currency, amount } of deltas) {
    trackAnalyticsEvent('currency_spent', {
      source: 'store_upgrade',
      upgrade_key: upgradeKey,
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
