import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_TRACK_EVENT } from '../js/analytics.js';
import { getBalanceDelta, trackUpgradePurchaseAnalytics } from '../js/store/store-analytics.js';

test('getBalanceDelta returns only positive spent amounts per currency', () => {
  const deltas = getBalanceDelta(
    { gold: 120, silver: 40, stars: 2 },
    { gold: 95, silver: 40, stars: 5 }
  );

  assert.deepEqual(deltas, [{ currency: 'gold', amount: 25 }]);
});

test('trackUpgradePurchaseAnalytics emits upgrade_purchase and currency_spent analytics events', () => {
  const events = [];
  const originalWindow = globalThis.window;
  const originalCustomEvent = globalThis.CustomEvent;

  globalThis.CustomEvent = class CustomEventPolyfill {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  globalThis.window = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    }
  };

  try {
    trackUpgradePurchaseAnalytics({
      upgradeKey: 'shield_capacity',
      tier: 1,
      previousBalance: { gold: 200, silver: 100 },
      nextBalance: { gold: 125, silver: 100 }
    });
  } finally {
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
  }

  assert.equal(events.length, 2);
  assert.equal(events[0].type, ANALYTICS_TRACK_EVENT);
  assert.equal(events[0].detail.name, 'upgrade_purchase');
  assert.deepEqual(events[0].detail.payload, {
    upgrade_key: 'shield_capacity',
    tier: 1,
    next_level: 2,
    success: true
  });

  assert.equal(events[1].type, ANALYTICS_TRACK_EVENT);
  assert.equal(events[1].detail.name, 'currency_spent');
  assert.deepEqual(events[1].detail.payload, {
    source: 'store_upgrade',
    upgrade_key: 'shield_capacity',
    currency: 'gold',
    amount: 75
  });
});
