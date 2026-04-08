import test from 'node:test';
import assert from 'node:assert/strict';
import { getDifficultySegment, normalizeRunIndex } from '../js/game/difficulty-segmentation.js';

test('normalizeRunIndex clamps invalid values to 1', () => {
  assert.equal(normalizeRunIndex(0), 1);
  assert.equal(normalizeRunIndex(-2), 1);
  assert.equal(normalizeRunIndex(Number.NaN), 1);
  assert.equal(normalizeRunIndex('7.9'), 7);
});

test('getDifficultySegment returns expected buckets', () => {
  assert.equal(getDifficultySegment(1), 'new');
  assert.equal(getDifficultySegment(5), 'new');
  assert.equal(getDifficultySegment(6), 'developing');
  assert.equal(getDifficultySegment(20), 'developing');
  assert.equal(getDifficultySegment(21), 'returning');
});
