import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  LEGACY_BLOCK
} from './check-physics-effect-timers-staging.mjs';
import {
  DOMAIN_IMPORT_STATEMENT,
  EFFECT_TIMERS_CALL_BLOCK,
  IMPORT_ANCHORS,
  analyzePhysicsEffectTimersCutover,
  findImportAnchor,
  replaceExactlyOnce,
  transformPhysics
} from './cutover-physics-effect-timers.mjs';

const DOMAIN_SOURCE = `function calculateEffectTimersStep({ player, gameState, delta }) {
  let spinCooldown = gameState.spinCooldown;
  let magnetActive = player.magnetActive;
  let magnetTimer = player.magnetTimer;
  let invertActive = player.invertActive;
  let invertTimer = player.invertTimer;
  let baseMultiplier = gameState.baseMultiplier;
  let x2Timer = gameState.x2Timer;
  if (spinCooldown > 0) spinCooldown--;
  if (magnetActive) {
    magnetTimer -= delta;
  }
  if (invertActive) {
    invertTimer -= delta;
  }
  if (baseMultiplier > 1) {
    x2Timer -= delta;
    if (x2Timer <= 0) baseMultiplier = 1;
  }
  return { player: { magnetActive, magnetTimer, invertActive, invertTimer }, gameState: { spinCooldown, baseMultiplier, x2Timer } };
}
export { calculateEffectTimersStep };
`;

function stagedPhysics({ anchor = IMPORT_ANCHORS.at(-1), includeAnchor = true } = {}) {
  return `import { CONFIG } from './config.js';
${includeAnchor ? `${anchor}\n` : ''}function update(delta) {
  if (gameState.spinActive) finishSpin();
${LEGACY_BLOCK}
  // Player position
  const p = projectPlayer(CONFIG.PLAYER_Z);
}`;
}

test('cuts over all effect timer ownership atomically', () => {
  const beforeSource = stagedPhysics();
  const result = analyzePhysicsEffectTimersCutover({ physicsSource: beforeSource, domainSource: DOMAIN_SOURCE });
  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-inline');
  assert.equal(result.after.state, 'extracted');
  assert.ok(result.physicsSource.includes(DOMAIN_IMPORT_STATEMENT));
  assert.ok(result.physicsSource.includes(EFFECT_TIMERS_CALL_BLOCK));
  assert.equal(result.physicsSource.includes(LEGACY_BLOCK), false);
  assert.ok(result.physicsSource.split('\n').length < beforeSource.split('\n').length);
});

test('supports progress, center-offset and camera-shake import orders', () => {
  for (const anchor of IMPORT_ANCHORS) {
    const source = stagedPhysics({ anchor });
    assert.equal(findImportAnchor(source), anchor);
    const result = analyzePhysicsEffectTimersCutover({ physicsSource: source, domainSource: DOMAIN_SOURCE });
    assert.equal(result.after.state, 'extracted');
    assert.ok(result.physicsSource.includes(`${anchor}\n${DOMAIN_IMPORT_STATEMENT}`));
  }
});

test('preserves spin completion, timer update and player-position ordering', () => {
  const result = analyzePhysicsEffectTimersCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const source = result.physicsSource;
  assert.ok(source.indexOf('finishSpin();') < source.indexOf('const effectTimersStep ='));
  assert.ok(source.indexOf('Object.assign(gameState, effectTimersStep.gameState);') < source.indexOf('// Player position'));
});

test('accepts an already extracted no-op', () => {
  const first = analyzePhysicsEffectTimersCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const second = analyzePhysicsEffectTimersCutover({ physicsSource: first.physicsSource, domainSource: DOMAIN_SOURCE });
  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects a missing import anchor', () => {
  assert.throws(() => transformPhysics(stagedPhysics({ includeAnchor: false })), /import anchor not found/);
});

test('rejects a premature domain import while legacy timers remain', () => {
  assert.throws(() => transformPhysics(
    stagedPhysics().replace(IMPORT_ANCHORS.at(-1), `${IMPORT_ANCHORS.at(-1)}\n${DOMAIN_IMPORT_STATEMENT}`)
  ), /partial effect-timers extraction/);
});

test('requires every exact replacement target to occur once', () => {
  assert.throws(() => replaceExactlyOnce('x x', 'x', 'y', 'fixture'), /appears more than once/);
  assert.throws(() => replaceExactlyOnce('abc', 'x', 'y', 'fixture'), /was not found/);
});

test('does not accept an extracted call without the domain import', () => {
  const first = analyzePhysicsEffectTimersCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.throws(() => analyzePhysicsEffectTimersCutover({
    physicsSource: first.physicsSource.replace(`import { calculateEffectTimersStep } ${DOMAIN_IMPORT};\n`, ''),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
});
