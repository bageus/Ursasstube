import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateProgressStep } from '../js/physics/progress-step.js';

const BASE = Object.freeze({
  distance: 0,
  delta: 1 / 60,
  speedStart: 0.02,
  speedIncrementInterval: 500,
  speedIncrementBoostDistance: 2000,
  speedIncrementBoostMultiplier: 2,
  speedIncrement: 0.002,
  speedMax: 0.08,
  invertActive: false,
  invertScoreMultiplier: 1
});

function inlineReference(input) {
  const speedLevel = Math.floor(input.distance / input.speedIncrementInterval);
  const speedIncrementMultiplier = input.distance >= input.speedIncrementBoostDistance
    ? input.speedIncrementBoostMultiplier
    : 1;
  const speed = Math.min(
    input.speedStart + speedLevel * input.speedIncrement * speedIncrementMultiplier,
    input.speedMax
  );
  const metersDelta = speed * 300 * input.delta;
  const speedFactor = speed / input.speedStart;
  let pointsPerMeter = speedFactor;
  if (input.invertActive && input.invertScoreMultiplier > 1) {
    pointsPerMeter *= input.invertScoreMultiplier;
  }
  return {
    speedLevel,
    speedIncrementMultiplier,
    speed,
    metersDelta,
    pointsPerMeter,
    scoreDelta: metersDelta * pointsPerMeter
  };
}

function assertResultClose(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12, `${key}: ${actual[key]} !== ${expected[key]}`);
  }
}

test('matches the current inline physics calculation across a reference matrix', () => {
  const cases = [
    BASE,
    { ...BASE, distance: 499.999 },
    { ...BASE, distance: 500 },
    { ...BASE, distance: 1999.999, delta: 0.02 },
    { ...BASE, distance: 2000, delta: 0.02 },
    { ...BASE, distance: 12000, delta: 0.1 },
    { ...BASE, distance: 2500, invertActive: true, invertScoreMultiplier: 1.75 },
    { ...BASE, distance: 2500, invertActive: false, invertScoreMultiplier: 3 }
  ];

  for (const input of cases) {
    assertResultClose(calculateProgressStep(input), inlineReference(input));
  }
});

test('advances the speed tier exactly at the configured interval', () => {
  assert.equal(calculateProgressStep({ ...BASE, distance: 499.999 }).speedLevel, 0);
  assert.equal(calculateProgressStep({ ...BASE, distance: 500 }).speedLevel, 1);
});

test('enables the increment boost exactly at the configured distance', () => {
  assert.equal(calculateProgressStep({ ...BASE, distance: 1999.999 }).speedIncrementMultiplier, 1);
  assert.equal(calculateProgressStep({ ...BASE, distance: 2000 }).speedIncrementMultiplier, 2);
});

test('caps speed at speedMax', () => {
  assert.equal(calculateProgressStep({ ...BASE, distance: 100000 }).speed, BASE.speedMax);
});

test('applies invert scoring only while active and above one', () => {
  const normal = calculateProgressStep({ ...BASE, distance: 2500 });
  const inactive = calculateProgressStep({ ...BASE, distance: 2500, invertActive: false, invertScoreMultiplier: 4 });
  const neutral = calculateProgressStep({ ...BASE, distance: 2500, invertActive: true, invertScoreMultiplier: 1 });
  const boosted = calculateProgressStep({ ...BASE, distance: 2500, invertActive: true, invertScoreMultiplier: 2.5 });

  assert.equal(inactive.scoreDelta, normal.scoreDelta);
  assert.equal(neutral.scoreDelta, normal.scoreDelta);
  assert.equal(boosted.scoreDelta, normal.scoreDelta * 2.5);
});

test('scales distance and score linearly with delta', () => {
  const one = calculateProgressStep({ ...BASE, distance: 750, delta: 0.01 });
  const two = calculateProgressStep({ ...BASE, distance: 750, delta: 0.02 });
  assert.equal(two.metersDelta, one.metersDelta * 2);
  assert.equal(two.scoreDelta, one.scoreDelta * 2);
});
