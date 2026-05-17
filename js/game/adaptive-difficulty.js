import { CONFIG } from '../config.js';

const ADAPTIVE_TIERS = Object.freeze({
  NEW: 'new_0_6',
  LEARNING: 'learning_7_15',
  STANDARD: 'standard'
});

const degToRad = (deg) => deg * Math.PI / 180;

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
    maxCurveAngleRad: CONFIG.MAX_CURVE_ANGLE,
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
      maxCurveAngleRad: isNewTier ? degToRad(3.0) : degToRad(12),
      curveTransitionMultiplier: isNewTier ? 1.8 : 1.5,
      centerOffsetMultiplier: isNewTier ? 0.10 : 0.2,
      maxCurveStrength: isNewTier ? 0.26 : 0.38,
      maxDirectionDelta: isNewTier ? Math.PI / 16 : Math.PI / 5,
      minCurveTransitionDurationMs: isNewTier ? 17000 : 13000,
      centerOffsetSmoothing: isNewTier ? 0.9 : 2.0,
      noDownwardTurns: true
    };
  }

  return {
    tier,
    obstacleDensityMultiplier: isNewTier ? 0.5 : 0.7,
    maxCurveAngleRad: isNewTier ? degToRad(2.2) : degToRad(10),
    curveTransitionMultiplier: isNewTier ? 1.8 : 1.5,
    centerOffsetMultiplier: isNewTier ? 0.08 : 0.18,
    maxCurveStrength: isNewTier ? 0.22 : 0.35,
    maxDirectionDelta: isNewTier ? Math.PI / 18 : Math.PI / 6,
    minCurveTransitionDurationMs: isNewTier ? 18000 : 14000,
    centerOffsetSmoothing: isNewTier ? 0.8 : 1.8,
    noDownwardTurns: true
  };
}

export { getAdaptiveDifficultyProfile };
