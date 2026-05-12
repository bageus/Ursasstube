import assert from 'node:assert/strict';
import { getAdaptiveDifficultyProfile } from '../js/game/adaptive-difficulty.js';
import { CONFIG } from '../js/config.js';

assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: 0, distance: 100 }), {
  tier: 'new_0_6', obstacleDensityMultiplier: 0.5, maxCurveAngleDeg: 15, noDownwardTurns: true
});
assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: 6, distance: 1500 }), {
  tier: 'new_0_6', obstacleDensityMultiplier: 0.65, maxCurveAngleDeg: 15, noDownwardTurns: true
});
assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: 7, distance: 200 }), {
  tier: 'learning_7_15', obstacleDensityMultiplier: 0.7, maxCurveAngleDeg: 20, noDownwardTurns: true
});
assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: 15, distance: 1600 }), {
  tier: 'learning_7_15', obstacleDensityMultiplier: 0.84, maxCurveAngleDeg: 15, noDownwardTurns: true
});
assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: 1, distance: 2500 }), {
  tier: 'new_0_6', obstacleDensityMultiplier: 1, maxCurveAngleDeg: CONFIG.MAX_CURVE_ANGLE, noDownwardTurns: true
});
assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: 16, distance: 300 }), {
  tier: 'standard', obstacleDensityMultiplier: 1, maxCurveAngleDeg: CONFIG.MAX_CURVE_ANGLE, noDownwardTurns: true
});
assert.deepEqual(getAdaptiveDifficultyProfile({ completedRuns: null, distance: 300 }), {
  tier: 'standard', obstacleDensityMultiplier: 1, maxCurveAngleDeg: CONFIG.MAX_CURVE_ANGLE, noDownwardTurns: true
});

console.log('adaptive-difficulty tests passed');
