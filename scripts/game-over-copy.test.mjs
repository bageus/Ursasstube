import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameOverSummary, buildInsightsComparison, buildInsightsTarget } from '../js/game/game-over-copy.js';

test('title mapping priority handles first run and personal best', () => {
  const firstRun = buildGameOverSummary({
    score: 120,
    runIndex: 1,
    bestScoreBeforeRun: 0,
    bestScoreAfterRun: 120,
    entries: [],
    playerPosition: null,
    playerInsights: { isFirstRun: true, isPersonalBest: true, comparisonMode: 'none' }
  });
  assert.equal(firstRun.title, 'FIRST RUN!');

  const newRecord = buildGameOverSummary({
    score: 250,
    runIndex: 3,
    bestScoreBeforeRun: 200,
    bestScoreAfterRun: 250,
    entries: [],
    playerPosition: null,
    playerInsights: { isFirstRun: false, isPersonalBest: true, comparisonMode: 'overall', percentileOverall: 82 }
  });
  assert.equal(newRecord.title, 'NEW RECORD!');
});

test('comparison mode mapping returns percent text and hides for none mode', () => {
  const overall = buildInsightsComparison({ comparisonMode: 'overall', percentileOverall: 77.2 });
  assert.equal(overall.isPercentileVisible, true);
  assert.match(overall.text, /77%/);

  const none = buildInsightsComparison({ comparisonMode: 'none', percentileOverall: 45 });
  assert.equal(none.isPercentileVisible, false);
});

test('recommended target maps to CTA format', () => {
  const target = buildInsightsTarget({
    recommendedTarget: { type: 'score', label: 'TOP 100', delta: 38 },
    nextTargets: [{ type: 'score', label: 'TOP 50', delta: 80 }]
  }, 'fallback');

  assert.equal(target.hasRecommendedTarget, true);
  assert.equal(target.text, 'Next: +38 to TOP 100');
  assert.equal(target.list.length, 1);
});

test('graceful fallback with missing fields does not throw and returns default text', () => {
  const summary = buildGameOverSummary({
    score: 300,
    runIndex: 5,
    bestScoreBeforeRun: 310,
    bestScoreAfterRun: 310,
    entries: [],
    playerPosition: null,
    playerInsights: { comparisonMode: 'overall' }
  });

  assert.equal(typeof summary.comparison.text, 'string');
  assert.equal(typeof summary.nextTarget.text, 'string');
});
