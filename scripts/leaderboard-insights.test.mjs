import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlayerInsights, getRankBucket } from '../js/game/leaderboard-insights.js';

test('V1 response shape without insights is handled', () => {
  const result = validatePlayerInsights(undefined);
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
});

test('V2 full insights passes validation and normalizes targets', () => {
  const result = validatePlayerInsights({
    isFirstRun: false,
    isPersonalBest: true,
    rank: 42,
    comparisonMode: 'first_run_score',
    percentileFirstRunScore: 91,
    recommendedTarget: { type: 'score', label: 'TOP 10', delta: 120 },
    nextTargets: [
      { type: 'score', label: 'TOP 5', delta: 220 },
      { type: 'distance', label: '500m', delta: 30 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.comparisonMode, 'first_run_score');
  assert.equal(result.data.recommendedTarget.label, 'TOP 10');
  assert.equal(result.data.nextTargets.length, 2);
  assert.equal(getRankBucket(result.data.rank), 'top_100');
});

test('V2 partial/null insights are normalized safely', () => {
  const result = validatePlayerInsights({
    comparisonMode: 'first_run_coins',
    percentileFirstRunCoins: null,
    recommendedTarget: null,
    nextTargets: [{ label: '', delta: 12 }, { label: 'Coins', delta: '5' }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.percentileFirstRunCoins, null);
  assert.equal(result.data.recommendedTarget, null);
  assert.equal(result.data.nextTargets.length, 1);
  assert.equal(result.data.nextTargets[0].delta, 5);
});
