import { CONFIG } from '../config.js';

const ADAPTIVE_TIERS = Object.freeze({
  NEW: 'new_0_6',
  LEARNING: 'learning_7_15',
  STANDARD: 'standard'
});

function toFiniteNumber(value, fallback = NaN) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getAdaptiveDifficultyProfile({ completedRuns, distance }) {
  const runCount = toFiniteNumber(completedRuns, NaN);
  const distanceMeters = Math.max(0, toFiniteNumber(distance, 0));
  const standardProfile = {
    tier: ADAPTIVE_TIERS.STANDARD,
    obstacleDensityMultiplier: 1,
    maxCurveAngleDeg: CONFIG.MAX_CURVE_ANGLE,
    curveTransitionMultiplier: 1,
    centerOffsetMultiplier: 1,
    maxCurveStrength: 1,
    maxDirectionDelta: Math.PI * 2,
    minCurveTransitionDurationMs: CONFIG.MIN_CURVE_TIME,
    centerOffsetSmoothing: 12,
    noDownwardTurns: true
  };

  if (!Number.isFinite(runCount) || runCount >= 16) {
    return standardProfile;
  }

  const isNewTier = runCount <= 6;
  const tier = isNewTier ? ADAPTIVE_TIERS.NEW : ADAPTIVE_TIERS.LEARNING;

  if (distanceMeters >= 2000) {
    return {
      ...standardProfile,
      tier
    };
  }

  if (distanceMeters >= 1000) {
    return {
      tier,
      obstacleDensityMultiplier: isNewTier ? 0.65 : 0.84,
      maxCurveAngleDeg: isNewTier ? 15 : 15,
      curveTransitionMultiplier: isNewTier ? 1.8 : 1.5,
      centerOffsetMultiplier: isNewTier ? 0.3 : 0.35,
      maxCurveStrength: isNewTier ? 0.4 : 0.45,
      maxDirectionDelta: isNewTier ? Math.PI / 4 : Math.PI / 3,
      minCurveTransitionDurationMs: isNewTier ? 11000 : 9500,
      centerOffsetSmoothing: isNewTier ? 7 : 9,
      noDownwardTurns: true
    };
  }

  return {
    tier,
    obstacleDensityMultiplier: isNewTier ? 0.5 : 0.7,
    maxCurveAngleDeg: isNewTier ? 15 : 20,
    curveTransitionMultiplier: isNewTier ? 1.8 : 1.5,
    centerOffsetMultiplier: isNewTier ? 0.25 : 0.4,
    maxCurveStrength: isNewTier ? 0.35 : 0.5,
    maxDirectionDelta: isNewTier ? Math.PI / 5 : Math.PI / 3,
    minCurveTransitionDurationMs: isNewTier ? 12000 : 9500,
    centerOffsetSmoothing: isNewTier ? 7 : 9,
    noDownwardTurns: true
  };
}

export { getAdaptiveDifficultyProfile };
