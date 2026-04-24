// @ts-check

/** @typedef {'overall'|'first_run_score'|'first_run_distance'|'first_run_coins'|'none'} ComparisonMode */

/**
 * @typedef {Object} InsightsTarget
 * @property {string} [type]
 * @property {string} [label]
 * @property {number|null} [delta]
 */

/**
 * @typedef {Object} PlayerInsights
 * @property {boolean} [isFirstRun]
 * @property {boolean} [isPersonalBest]
 * @property {number|null} [rank]
 * @property {ComparisonMode} [comparisonMode]
 * @property {number|null} [percentileOverall]
 * @property {number|null} [percentileFirstRunScore]
 * @property {number|null} [percentileFirstRunDistance]
 * @property {number|null} [percentileFirstRunCoins]
 * @property {'weak_first_run'|'weak_repeat_run'|string|null} [comparisonTextFallbackType]
 * @property {InsightsTarget|null} [recommendedTarget]
 * @property {Array<InsightsTarget>|null} [nextTargets]
 */

/**
 * @typedef {Object} LeaderboardTopResponseV1
 * @property {Array<Object>} leaderboard
 * @property {number|null} playerPosition
 */

/**
 * @typedef {LeaderboardTopResponseV1 & { playerInsights?: unknown }} LeaderboardTopResponseV2
 */

function asFiniteNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizePercentile(value) {
  if (value == null || value === '') return null;
  const num = asFiniteNumberOrNull(value);
  if (num === null) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

function normalizeTarget(value) {
  if (!value || typeof value !== 'object') return null;
  const label = String(value.label || '').trim();
  const type = String(value.type || '').trim();
  const delta = asFiniteNumberOrNull(value.delta);
  if (!label) return null;
  return {
    type: type || 'unknown',
    label,
    delta
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: boolean, data: PlayerInsights|null }}
 */
function validatePlayerInsights(value) {
  if (!value || typeof value !== 'object') {
    return { ok: false, data: null };
  }

  const comparisonModeValue = String(value.comparisonMode || 'none');
  /** @type {ComparisonMode} */
  const comparisonMode = (
    comparisonModeValue === 'overall'
    || comparisonModeValue === 'first_run_score'
    || comparisonModeValue === 'first_run_distance'
    || comparisonModeValue === 'first_run_coins'
    || comparisonModeValue === 'none'
  ) ? comparisonModeValue : 'none';

  const nextTargetsRaw = Array.isArray(value.nextTargets) ? value.nextTargets : [];
  const nextTargets = nextTargetsRaw.map(normalizeTarget).filter(Boolean).slice(0, 3);
  const fallbackType = value.comparisonTextFallbackType == null ? null : String(value.comparisonTextFallbackType);

  return {
    ok: true,
    data: {
      isFirstRun: Boolean(value.isFirstRun),
      isPersonalBest: Boolean(value.isPersonalBest),
      rank: asFiniteNumberOrNull(value.rank),
      comparisonMode,
      percentileOverall: normalizePercentile(value.percentileOverall),
      percentileFirstRunScore: normalizePercentile(value.percentileFirstRunScore),
      percentileFirstRunDistance: normalizePercentile(value.percentileFirstRunDistance),
      percentileFirstRunCoins: normalizePercentile(value.percentileFirstRunCoins),
      comparisonTextFallbackType: fallbackType,
      recommendedTarget: normalizeTarget(value.recommendedTarget),
      nextTargets: nextTargets.length > 0 ? nextTargets : null
    }
  };
}

function getPercentileByMode(mode, insights) {
  if (!insights) return null;
  switch (mode) {
    case 'overall': return insights.percentileOverall ?? null;
    case 'first_run_score': return insights.percentileFirstRunScore ?? null;
    case 'first_run_distance': return insights.percentileFirstRunDistance ?? null;
    case 'first_run_coins': return insights.percentileFirstRunCoins ?? null;
    default: return null;
  }
}

function getComparisonLabelByMode(mode) {
  switch (mode) {
    case 'overall': return 'Лучше, чем X% игроков в общем зачёте';
    case 'first_run_score': return 'Лучше, чем X% первых заездов по score';
    case 'first_run_distance': return 'Лучше, чем X% первых заездов по distance';
    case 'first_run_coins': return 'Лучше, чем X% первых заездов по coins';
    default: return 'Прогресс засчитан. Попробуй ещё раз!';
  }
}

function getRankBucket(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  if (value <= 10) return 'top_10';
  if (value <= 100) return 'top_100';
  if (value <= 1000) return 'top_1000';
  return 'other';
}

export {
  validatePlayerInsights,
  getPercentileByMode,
  getComparisonLabelByMode,
  getRankBucket
};
