import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateEffectTimersStep } from '../js/physics/effect-timers-step.js';

const BASE_PLAYER = Object.freeze({
  magnetActive: true,
  magnetTimer: 5,
  invertActive: true,
  invertTimer: 3
});
const BASE_GAME_STATE = Object.freeze({
  spinCooldown: 4,
  baseMultiplier: 2,
  x2Timer: 6
});

function inlineReference({ player, gameState, delta }) {
  let spinCooldown = gameState.spinCooldown;
  let baseMultiplier = gameState.baseMultiplier;
  let x2Timer = gameState.x2Timer;
  let magnetActive = player.magnetActive;
  let magnetTimer = player.magnetTimer;
  let invertActive = player.invertActive;
  let invertTimer = player.invertTimer;

  if (spinCooldown > 0) spinCooldown--;
  if (magnetActive) {
    magnetTimer -= delta;
    if (magnetTimer <= 0) magnetActive = false;
  }
  if (invertActive) {
    invertTimer -= delta;
    if (invertTimer <= 0) invertActive = false;
  }
  if (baseMultiplier > 1) {
    x2Timer -= delta;
    if (x2Timer <= 0) baseMultiplier = 1;
  }

  return {
    player: { magnetActive, magnetTimer, invertActive, invertTimer },
    gameState: { spinCooldown, baseMultiplier, x2Timer }
  };
}

test('matches the current inline timer transitions across a reference matrix', () => {
  const cases = [
    { player: BASE_PLAYER, gameState: BASE_GAME_STATE, delta: 1 / 60 },
    { player: { ...BASE_PLAYER, magnetTimer: 0.01 }, gameState: BASE_GAME_STATE, delta: 0.02 },
    { player: { ...BASE_PLAYER, invertTimer: 0 }, gameState: BASE_GAME_STATE, delta: 0 },
    { player: { ...BASE_PLAYER, magnetActive: false, invertActive: false }, gameState: { ...BASE_GAME_STATE, spinCooldown: 0, baseMultiplier: 1 }, delta: 10 },
    { player: BASE_PLAYER, gameState: { ...BASE_GAME_STATE, x2Timer: 0.25 }, delta: 0.5 }
  ];
  for (const input of cases) {
    assert.deepEqual(calculateEffectTimersStep(input), inlineReference(input));
  }
});

test('decrements spin cooldown by one frame rather than delta', () => {
  const result = calculateEffectTimersStep({ player: BASE_PLAYER, gameState: BASE_GAME_STATE, delta: 10 });
  assert.equal(result.gameState.spinCooldown, 3);
});

test('expires magnet and invert without clamping their timers', () => {
  const result = calculateEffectTimersStep({
    player: { ...BASE_PLAYER, magnetTimer: 0.1, invertTimer: 0.2 },
    gameState: BASE_GAME_STATE,
    delta: 0.5
  });
  assert.equal(result.player.magnetActive, false);
  assert.equal(result.player.invertActive, false);
  assert.equal(result.player.magnetTimer, -0.4);
  assert.equal(result.player.invertTimer, -0.3);
});

test('leaves inactive effect timers unchanged', () => {
  const result = calculateEffectTimersStep({
    player: { magnetActive: false, magnetTimer: 9, invertActive: false, invertTimer: 8 },
    gameState: BASE_GAME_STATE,
    delta: 2
  });
  assert.equal(result.player.magnetTimer, 9);
  assert.equal(result.player.invertTimer, 8);
});

test('resets only the base multiplier when x2 expires', () => {
  const result = calculateEffectTimersStep({
    player: BASE_PLAYER,
    gameState: { ...BASE_GAME_STATE, x2Timer: 0.1 },
    delta: 0.25
  });
  assert.equal(result.gameState.baseMultiplier, 1);
  assert.equal(result.gameState.x2Timer, -0.15);
});

test('does not mutate player or game state inputs', () => {
  const player = { ...BASE_PLAYER };
  const gameState = { ...BASE_GAME_STATE };
  const before = JSON.stringify({ player, gameState });
  calculateEffectTimersStep({ player, gameState, delta: 1 / 60 });
  assert.equal(JSON.stringify({ player, gameState }), before);
});
