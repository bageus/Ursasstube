function normalizeNonNegative(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return 0;
  return Math.floor(numericValue);
}

function buildCollisionReactionMetrics({
  obstacleCollisionCount = 0,
  collisionWithoutReactionCount = 0,
} = {}) {
  const collisions = normalizeNonNegative(obstacleCollisionCount);
  const withoutReaction = Math.min(
    collisions,
    normalizeNonNegative(collisionWithoutReactionCount),
  );
  const rate = collisions > 0
    ? Number((withoutReaction / collisions).toFixed(4))
    : 0;

  return {
    obstacle_collision_count: collisions,
    collision_without_reaction_count: withoutReaction,
    collision_without_reaction_rate: rate,
  };
}

export { buildCollisionReactionMetrics };
