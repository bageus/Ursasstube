import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateCameraShakeStep } from '../js/physics/camera-shake-step.js';

const CAMERA_SHAKE_SMOOTHING = 12;
const BASE_STATE = Object.freeze({
  distance: 2500,
  speed: 0.08,
  cameraShakeX: 0.2,
  cameraShakeY: -0.1,
  centerOffsetX: 12,
  centerOffsetY: -8
});
const BASE_PROFILE = Object.freeze({ tier: 'standard' });
const BASE_CONFIG = Object.freeze({
  SPEED_START: 0.04,
  SPEED_MAX: 0.12
});

function inlineReference({ gameState, adaptiveProfile, config, delta, cameraShakeSmoothing, randomX, randomY }) {
  const adaptiveTier = adaptiveProfile.tier;
  const suppressShake = adaptiveTier !== 'standard' && gameState.distance < 2000;
  let cameraShakeX = gameState.cameraShakeX;
  let cameraShakeY = gameState.cameraShakeY;
  if (suppressShake) {
    cameraShakeX = 0;
    cameraShakeY = 0;
  } else {
    const speedRatio = (gameState.speed - config.SPEED_START) / (config.SPEED_MAX - config.SPEED_START);
    const shakeLerp = Math.min(1, delta * cameraShakeSmoothing);
    const shakeIntensity = speedRatio > 0.3 ? (speedRatio - 0.3) * 4 : 0;
    const shakeTargetX = (randomX - 0.5) * shakeIntensity;
    const shakeTargetY = (randomY - 0.5) * shakeIntensity;
    cameraShakeX += (shakeTargetX - cameraShakeX) * shakeLerp;
    cameraShakeY += (shakeTargetY - cameraShakeY) * shakeLerp;
  }
  return {
    cameraShakeX,
    cameraShakeY,
    renderCenterOffsetX: gameState.centerOffsetX + cameraShakeX,
    renderCenterOffsetY: gameState.centerOffsetY + cameraShakeY
  };
}

function assertClose(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12, `${key}: ${actual[key]} !== ${expected[key]}`);
  }
}

function withDefaults(input) {
  return { cameraShakeSmoothing: CAMERA_SHAKE_SMOOTHING, ...input };
}

test('matches the current inline camera shake calculation across a reference matrix', () => {
  const cases = [
    withDefaults({ gameState: BASE_STATE, adaptiveProfile: BASE_PROFILE, config: BASE_CONFIG, delta: 1 / 60, randomX: 0.9, randomY: 0.1 }),
    withDefaults({ gameState: { ...BASE_STATE, speed: 0.05 }, adaptiveProfile: BASE_PROFILE, config: BASE_CONFIG, delta: 1 / 60, randomX: 1, randomY: 0 }),
    withDefaults({ gameState: { ...BASE_STATE, distance: 1999 }, adaptiveProfile: { tier: 'beginner' }, config: BASE_CONFIG, delta: 1 / 60, randomX: 0.8, randomY: 0.2 }),
    withDefaults({ gameState: { ...BASE_STATE, distance: 2000 }, adaptiveProfile: { tier: 'beginner' }, config: BASE_CONFIG, delta: 0.2, randomX: 0.7, randomY: 0.3 })
  ];
  for (const input of cases) {
    assertClose(calculateCameraShakeStep(input), inlineReference(input));
  }
});

test('suppresses shake for protected non-standard tiers before 2000m', () => {
  const result = calculateCameraShakeStep(withDefaults({
    gameState: { ...BASE_STATE, distance: 1999 },
    adaptiveProfile: { tier: 'beginner' },
    config: BASE_CONFIG,
    delta: 1 / 60,
    randomX: 1,
    randomY: 0
  }));
  assert.equal(result.cameraShakeX, 0);
  assert.equal(result.cameraShakeY, 0);
  assert.equal(result.renderCenterOffsetX, BASE_STATE.centerOffsetX);
  assert.equal(result.renderCenterOffsetY, BASE_STATE.centerOffsetY);
});

test('does not suppress the standard tier before 2000m', () => {
  const result = calculateCameraShakeStep(withDefaults({
    gameState: { ...BASE_STATE, distance: 500 },
    adaptiveProfile: BASE_PROFILE,
    config: BASE_CONFIG,
    delta: 1 / 60,
    randomX: 1,
    randomY: 0
  }));
  assert.notEqual(result.cameraShakeX, 0);
  assert.notEqual(result.cameraShakeY, 0);
});

test('decays existing shake toward zero when speed is below the intensity threshold', () => {
  const result = calculateCameraShakeStep(withDefaults({
    gameState: { ...BASE_STATE, speed: 0.05 },
    adaptiveProfile: BASE_PROFILE,
    config: BASE_CONFIG,
    delta: 1 / 60,
    randomX: 1,
    randomY: 0
  }));
  assert.ok(Math.abs(result.cameraShakeX) < Math.abs(BASE_STATE.cameraShakeX));
  assert.ok(Math.abs(result.cameraShakeY) < Math.abs(BASE_STATE.cameraShakeY));
});

test('clamps smoothing interpolation to one', () => {
  const result = calculateCameraShakeStep(withDefaults({
    gameState: BASE_STATE,
    adaptiveProfile: BASE_PROFILE,
    config: BASE_CONFIG,
    delta: 10,
    randomX: 1,
    randomY: 0
  }));
  const speedRatio = (BASE_STATE.speed - BASE_CONFIG.SPEED_START) / (BASE_CONFIG.SPEED_MAX - BASE_CONFIG.SPEED_START);
  const intensity = (speedRatio - 0.3) * 4;
  assert.equal(result.cameraShakeX, 0.5 * intensity);
  assert.equal(result.cameraShakeY, -0.5 * intensity);
});

test('does not mutate grouped inputs', () => {
  const gameState = { ...BASE_STATE };
  const adaptiveProfile = { ...BASE_PROFILE };
  const config = { ...BASE_CONFIG };
  const before = JSON.stringify({ gameState, adaptiveProfile, config });
  calculateCameraShakeStep(withDefaults({ gameState, adaptiveProfile, config, delta: 1 / 60, randomX: 0.8, randomY: 0.2 }));
  assert.equal(JSON.stringify({ gameState, adaptiveProfile, config }), before);
});
