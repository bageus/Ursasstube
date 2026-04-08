function normalizeRunIndex(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function getDifficultySegment(runIndex) {
  const normalizedRunIndex = normalizeRunIndex(runIndex);
  if (normalizedRunIndex <= 5) return 'new';
  if (normalizedRunIndex <= 20) return 'developing';
  return 'returning';
}

export { normalizeRunIndex, getDifficultySegment };
