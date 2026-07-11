import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateCenterOffsetStep } from '../js/physics/center-offset-step.js';

const BASE = Object.freeze({
  curveDirection: Math.PI / 4,
  tubeCurveStrength: 0.5,
  tubeRadius: 120,
  curveOffsetX: 0.8,
  curveOffsetY: 0.6,
  centerOffsetMultiplier: 1,
  noDownwardTurns: false,
  tier: 'standard',
  distance: 2000,
  centerOffsetSmoothing: 8,
  delta: 1 / 60,
  centerOffsetX: 0,
  centerOffsetY: 0
});

function inlineReference(input) {
  const multiplier = Math.max(0, Number(input.centerOffsetMultiplier) || 0);
  const rawX = Math.cos(input.curveDirection) * input.tubeCurveStrength * input.tubeRadius * input.curveOffsetX;
  const rawY = Math.sin(input.curveDirection) * input.tubeCurveStrength * input.tubeRadius * input.curveOffsetY;
  const targetX = rawX * multiplier;
  const targetY = rawY * multiplier;
  const limit = input.noDownwardTurns && input.tier !== 'standard' ? 2000 : 1500;
  const constrainedY = input.distance < limit ? Math.min(targetY, 0) : targetY;
  const lerp = Math.min(1, input.delta * Math.max(1, input.centerOffsetSmoothing || 1));
  return {
    targetCenterOffsetX: targetX,
    targetCenterOffsetY: targetY,
    constrainedCenterOffsetY: constrainedY,
    centerOffsetLerp: lerp,
    centerOffsetX: input.centerOffsetX + (targetX - input.centerOffsetX) * lerp,
    centerOffsetY: input.centerOffsetY + (constrainedY - input.centerOffsetY) * lerp
  };
}

function assertClose(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12, `${key}: ${actual[key]} !== ${expected[key]}`);
  }
}

test('matches the current inline center offset calculation across a reference matrix', () => {
  const cases = [
    BASE,
    { ...BASE, curveDirection: -Math.PI / 3, distance: 500 },
    { ...BASE, centerOffsetMultiplier: 0 },
    { ...BASE, centerOffsetMultiplier: -5 },
    { ...BASE, noDownwardTurns: true, tier: 'beginner', distance: 1999.999 },
    { ...BASE, noDownwardTurns: true, tier: 'beginner', distance: 2000 },
    { ...BASE, centerOffsetSmoothing: 100, delta: 0.2, centerOffsetX: 12, centerOffsetY: -8 }
  ];
  for (const input of cases) assertClose(calculateCenterOffsetStep(input), inlineReference(input));
});

test('uses the 2000m downward-turn limit only for non-standard protected tiers', () => {
  const protectedStep = calculateCenterOffsetStep({ ...BASE, curveDirection: Math.PI / 2, noDownwardTurns: true, tier: 'beginner', distance: 1800 });
  const standardStep = calculateCenterOffsetStep({ ...BASE, curveDirection: Math.PI / 2, noDownwardTurns: true, tier: 'standard', distance: 1800 });
  assert.equal(protectedStep.constrainedCenterOffsetY, 0);
  assert.ok(standardStep.constrainedCenterOffsetY > 0);
});

test('allows upward and neutral offsets before the distance limit', () => {
  const upward = calculateCenterOffsetStep({ ...BASE, curveDirection: -Math.PI / 2, distance: 100 });
  const neutral = calculateCenterOffsetStep({ ...BASE, curveDirection: 0, distance: 100 });
  assert.ok(upward.constrainedCenterOffsetY < 0);
  assert.equal(neutral.constrainedCenterOffsetY, 0);
});

test('clamps negative or invalid center offset multipliers to zero', () => {
  for (const value of [-1, Number.NaN, undefined]) {
    const result = calculateCenterOffsetStep({ ...BASE, centerOffsetMultiplier: value });
    assert.equal(result.targetCenterOffsetX, 0);
    assert.equal(result.targetCenterOffsetY, 0);
  }
});

test('clamps interpolation to one', () => {
  const result = calculateCenterOffsetStep({ ...BASE, delta: 2, centerOffsetSmoothing: 20 });
  assert.equal(result.centerOffsetLerp, 1);
  assert.equal(result.centerOffsetX, result.targetCenterOffsetX);
  assert.equal(result.centerOffsetY, result.constrainedCenterOffsetY);
});

test('interpolates from the current center offset instead of resetting it', () => {
  const result = calculateCenterOffsetStep({ ...BASE, centerOffsetX: 40, centerOffsetY: -20, delta: 0.01, centerOffsetSmoothing: 2 });
  assert.notEqual(result.centerOffsetX, result.targetCenterOffsetX);
  assert.notEqual(result.centerOffsetY, result.constrainedCenterOffsetY);
});
