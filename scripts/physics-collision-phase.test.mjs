import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OBSTACLE_COLLISION_PHASE_WINDOW,
  isObstacleInCollisionPhase
} from '../js/physics/collision-phase.js';

test('defines the expected obstacle collision windows', () => {
  assert.deepEqual(OBSTACLE_COLLISION_PHASE_WINDOW.fence, { start: 28, end: 45 });
  assert.deepEqual(OBSTACLE_COLLISION_PHASE_WINDOW.pit, { start: 35, end: 36 });
  assert.deepEqual(OBSTACLE_COLLISION_PHASE_WINDOW.spikes, { start: 35, end: 50 });
});

test('accepts inclusive phase boundaries', () => {
  assert.equal(isObstacleInCollisionPhase('fence', 28, 0, 100), true);
  assert.equal(isObstacleInCollisionPhase('fence', 45, 0, 100), true);
  assert.equal(isObstacleInCollisionPhase('pit', 35, 0, 100), true);
  assert.equal(isObstacleInCollisionPhase('pit', 36, 0, 100), true);
});

test('rejects known obstacle phases outside their window', () => {
  assert.equal(isObstacleInCollisionPhase('fence', 27.99, 0, 100), false);
  assert.equal(isObstacleInCollisionPhase('fence', 45.01, 0, 100), false);
  assert.equal(isObstacleInCollisionPhase('rock1', 34.99, 0, 100), false);
  assert.equal(isObstacleInCollisionPhase('rock1', 65.01, 0, 100), false);
});

test('normalizes phase against arbitrary collision depth bounds', () => {
  assert.equal(isObstacleInCollisionPhase('spikes', 13.5, 10, 20), true);
  assert.equal(isObstacleInCollisionPhase('spikes', 15, 10, 20), true);
  assert.equal(isObstacleInCollisionPhase('spikes', 15.1, 10, 20), false);
});

test('keeps the legacy permissive fallback for unknown obstacle types', () => {
  assert.equal(isObstacleInCollisionPhase('unknown', -100, 0, 1), true);
});

test('keeps the legacy permissive fallback for invalid numeric inputs', () => {
  assert.equal(isObstacleInCollisionPhase('fence', Number.NaN, 0, 1), true);
  assert.equal(isObstacleInCollisionPhase('fence', 0.5, Number.NaN, 1), true);
  assert.equal(isObstacleInCollisionPhase('fence', 0.5, 0, Number.POSITIVE_INFINITY), true);
  assert.equal(isObstacleInCollisionPhase('fence', 0.5, 1, 1), true);
  assert.equal(isObstacleInCollisionPhase('fence', 0.5, 2, 1), true);
});
