import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollisionReactionMetrics } from '../js/game/collision-reaction-metrics.js';

test('buildCollisionReactionMetrics calculates rounded rate', () => {
  assert.deepEqual(
    buildCollisionReactionMetrics({
      obstacleCollisionCount: 7,
      collisionWithoutReactionCount: 3,
    }),
    {
      obstacle_collision_count: 7,
      collision_without_reaction_count: 3,
      collision_without_reaction_rate: 0.4286,
    },
  );
});

test('buildCollisionReactionMetrics clamps invalid and overflow values', () => {
  assert.deepEqual(
    buildCollisionReactionMetrics({
      obstacleCollisionCount: -10,
      collisionWithoutReactionCount: 99,
    }),
    {
      obstacle_collision_count: 0,
      collision_without_reaction_count: 0,
      collision_without_reaction_rate: 0,
    },
  );
});
