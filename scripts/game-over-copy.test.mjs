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
    entries: Array.from({ length: 10 }, (_, idx) => ({ score: 1000 - idx * 100 })),
    playerPosition: 8,
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

test('practice mode uses dedicated unauth copy and save CTA', () => {
  const summary = buildGameOverSummary({
    score: 420,
    runIndex: 2,
    bestScoreBeforeRun: 420,
    bestScoreAfterRun: 420,
    entries: [{ score: 500 }, { score: 450 }, { score: 430 }],
    playerPosition: null,
    playerInsights: { comparisonMode: 'none' },
    isAuthenticated: false
  });

  assert.equal(summary.title, 'GOOD RUN!');
  assert.match(summary.comparison.text, /practice mode/i);
  assert.match(summary.nextTarget.text, /Save your score/i);
  assert.equal(summary.boostText, '');
});

test('high best score with weak current run shows beat-your-best CTA, not next-rank', () => {
  // Player is #2 in leaderboard (bestScore 15677) but scored only 186 in this run
  const entries = Array.from({ length: 20 }, (_, i) => ({ score: 20000 - i * 500 }));
  const summary = buildGameOverSummary({
    score: 186,
    runIndex: 10,
    bestScoreBeforeRun: 15677,
    bestScoreAfterRun: 15677,
    entries,
    playerPosition: null, // rank computed from current score (186) → far down the list
    playerInsights: { isFirstRun: false, isPersonalBest: false, comparisonMode: 'none' }
  });

  assert.equal(summary.title, 'GOOD RUN!');
  assert.match(summary.nextTarget.text, /best/i, 'nextTarget should reference the personal best, not next rank');
  assert.doesNotMatch(summary.nextTarget.text, /to the next rank/i, 'nextTarget must not say "to the next rank"');
});

test('boost line shows achieved rank only for a new personal best', () => {
  const newBest = buildGameOverSummary({
    score: 505,
    runIndex: 6,
    bestScoreBeforeRun: 480,
    bestScoreAfterRun: 505,
    entries: [],
    playerPosition: 101,
    playerInsights: { isFirstRun: false, isPersonalBest: true, rank: 101, comparisonMode: 'overall' },
    isAuthenticated: true
  });
  assert.equal(newBest.boostText, 'You’re #101');

  const weakerRun = buildGameOverSummary({
    score: 450,
    runIndex: 7,
    bestScoreBeforeRun: 505,
    bestScoreAfterRun: 505,
    entries: [],
    playerPosition: 120,
    playerInsights: { isFirstRun: false, isPersonalBest: false, rank: 120, comparisonMode: 'overall' },
    isAuthenticated: true
  });
  assert.equal(weakerRun.boostText, '');
});

test('backend prompt boost is preserved even when bestScoreAfterRun >> score', () => {
  // Backend returned a rank-based boost after scoring far below personal best.
  // Frontend must NOT override the backend's boost — the backend owns the methodology.
  const summary = buildGameOverSummary({
    score: 186,
    runIndex: 10,
    bestScoreBeforeRun: 15677,
    bestScoreAfterRun: 15677,
    entries: [],
    playerPosition: null,
    playerInsights: { isFirstRun: false, isPersonalBest: false, comparisonMode: 'none' },
    gameOverPrompt: {
      title: 'GOOD RUN!',
      hook: 'Keep climbing.',
      boost: '+9001 to the next rank',
      rank: 9
    },
    isAuthenticated: true
  });

  assert.equal(summary.meta.comparisonMode, 'backend_prompt');
  assert.equal(summary.nextTarget.text, '+9001 to the next rank', 'backend boost must be preserved as-is');
});

test('backend_prompt boost is preserved regardless of personal best gap', () => {
  // Player's best is 200, scored 186 — the backend's boost must always be returned unchanged.
  const summary = buildGameOverSummary({
    score: 186,
    runIndex: 3,
    bestScoreBeforeRun: 200,
    bestScoreAfterRun: 200,
    entries: [],
    playerPosition: null,
    playerInsights: { isFirstRun: false, isPersonalBest: false, comparisonMode: 'none' },
    gameOverPrompt: { title: '', hook: '', boost: '+50 to the next rank', rank: null },
    isAuthenticated: true
  });

  assert.equal(summary.meta.comparisonMode, 'backend_prompt');
  assert.equal(summary.nextTarget.text, '+50 to the next rank', 'backend boost must be preserved as-is');
});

test('practice mode: backend prompt boost is preserved even when bestScoreAfterRun >> score', () => {
  const summary = buildGameOverSummary({
    score: 186,
    runIndex: 5,
    bestScoreBeforeRun: 15677,
    bestScoreAfterRun: 15677,
    entries: [],
    playerPosition: null,
    playerInsights: { isFirstRun: false, isPersonalBest: false, comparisonMode: 'none' },
    gameOverPrompt: { title: '', hook: '', boost: '+9001 to the next rank', rank: null },
    isAuthenticated: false
  });

  assert.equal(summary.meta.comparisonMode, 'practice');
  assert.equal(summary.nextTarget.text, '+9001 to the next rank', 'backend boost must be preserved in practice mode');
});

test('practice mode without prompt boost still shows Save your score CTA', () => {
  const summary = buildGameOverSummary({
    score: 300,
    runIndex: 2,
    bestScoreBeforeRun: 300,
    bestScoreAfterRun: 300,
    entries: [],
    playerPosition: null,
    playerInsights: { comparisonMode: 'none' },
    isAuthenticated: false
  });

  assert.equal(summary.meta.comparisonMode, 'practice');
  assert.match(summary.nextTarget.text, /Save your score/i, 'default CTA must remain when no prompt boost is set');
});
