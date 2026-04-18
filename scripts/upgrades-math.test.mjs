import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumericLevel,
  parseSpinAlertLevel,
  getLevelFromUpgradeState,
  normalizeShieldCapacityLevel
} from '../js/store/upgrades-math.js';

test('parseNumericLevel normalizes non-finite and negative values', () => {
  assert.equal(parseNumericLevel('3.9'), 3);
  assert.equal(parseNumericLevel(-5), 0);
  assert.equal(parseNumericLevel('NaN'), 0);
});

test('parseSpinAlertLevel supports aliases and clamps to max tier 2', () => {
  assert.equal(parseSpinAlertLevel('perfect'), 2);
  assert.equal(parseSpinAlertLevel('active'), 1);
  assert.equal(parseSpinAlertLevel(10), 2);
  assert.equal(parseSpinAlertLevel('unknown'), 0);
});

test('getLevelFromUpgradeState merges scalar and tier-array fields', () => {
  const regularState = {
    currentLevel: 1,
    purchasedTiers: [0, 1, 2]
  };
  const spinState = {
    currentLevel: 1,
    purchasedTiers: [1, 2]
  };

  assert.equal(getLevelFromUpgradeState(regularState, 'shield'), 3);
  assert.equal(getLevelFromUpgradeState(spinState, 'spin_alert'), 2);
});

test('normalizeShieldCapacityLevel converts legacy values to bounded level', () => {
  assert.equal(normalizeShieldCapacityLevel(1), 0);
  assert.equal(normalizeShieldCapacityLevel(2), 1);
  assert.equal(normalizeShieldCapacityLevel(3), 2);
  assert.equal(normalizeShieldCapacityLevel(0, 'foo'), 0);
});
