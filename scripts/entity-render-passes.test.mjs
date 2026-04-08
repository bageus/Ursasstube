import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getObstacleReadabilityTint,
  getObstacleReadabilityTuning
} from '../js/phaser/entities/entity-render-passes.js';

test('getObstacleReadabilityTuning increases readability near player', () => {
  const far = getObstacleReadabilityTuning({ z: 1.0, playerZ: 0.12, growthStartZ: 1.0 });
  const near = getObstacleReadabilityTuning({ z: 0.2, playerZ: 0.12, growthStartZ: 1.0 });

  assert.equal(far.approachT, 0);
  assert.ok(near.approachT > far.approachT);
  assert.ok(near.readabilityBoost > far.readabilityBoost);
  assert.ok(near.alphaFloor > far.alphaFloor);
});

test('getObstacleReadabilityTuning stays bounded with invalid range', () => {
  const tuning = getObstacleReadabilityTuning({ z: -2, playerZ: 1, growthStartZ: 1 });

  assert.ok(tuning.approachT >= 0 && tuning.approachT <= 1);
  assert.ok(tuning.readabilityBoost >= 1 && tuning.readabilityBoost <= 1.25);
  assert.ok(tuning.alphaFloor >= 0.82 && tuning.alphaFloor <= 0.96);
});

test('getObstacleReadabilityTint blends from neutral to warm tint', () => {
  const farTint = getObstacleReadabilityTint(0);
  const nearTint = getObstacleReadabilityTint(1);
  const clampedTint = getObstacleReadabilityTint(99);

  assert.equal(farTint, 0xffffff);
  assert.equal(nearTint, 0xfff0c4);
  assert.equal(clampedTint, 0xfff0c4);
});
