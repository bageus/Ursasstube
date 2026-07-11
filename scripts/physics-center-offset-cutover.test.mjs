import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  LEGACY_BLOCK
} from './check-physics-center-offset-staging.mjs';
import {
  CENTER_OFFSET_CALL_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  analyzePhysicsCenterOffsetCutover,
  replaceExactlyOnce,
  transformPhysics
} from './cutover-physics-center-offset.mjs';

const DOMAIN_SOURCE = `function calculateCenterOffsetStep({ gameState, adaptiveProfile, config, delta }) {
  const multiplier = Math.max(0, Number(adaptiveProfile.centerOffsetMultiplier) || 0);
  const targetCenterOffsetX = Math.cos(gameState.curveDirection) * gameState.tubeCurveStrength * config.TUBE_RADIUS * config.CURVE_OFFSET_X * multiplier;
  const targetCenterOffsetY = Math.sin(gameState.curveDirection) * gameState.tubeCurveStrength * config.TUBE_RADIUS * config.CURVE_OFFSET_Y * multiplier;
  const limit = adaptiveProfile.noDownwardTurns && adaptiveProfile.tier !== 'standard' ? 2000 : 1500;
  const constrained = gameState.distance < limit ? Math.min(targetCenterOffsetY, 0) : targetCenterOffsetY;
  const lerp = Math.min(1, delta * Math.max(1, adaptiveProfile.centerOffsetSmoothing || 1));
  return {
    centerOffsetX: gameState.centerOffsetX + (targetCenterOffsetX - gameState.centerOffsetX) * lerp,
    centerOffsetY: gameState.centerOffsetY + (constrained - gameState.centerOffsetY) * lerp
  };
}
export { calculateCenterOffsetStep };
`;

function stagedPhysics({ includeAnchor = true } = {}) {
  return `import { CONFIG } from './config.js';
${includeAnchor ? `${IMPORT_ANCHOR}\n` : ''}function update(delta) {
  const p = projectPlayer(CONFIG.PLAYER_Z);
${LEGACY_BLOCK}
  // Camera shake from speed
  const adaptiveTier = adaptiveProfile.tier;
}`;
}

test('cuts over the center-offset ownership atomically', () => {
  const result = analyzePhysicsCenterOffsetCutover({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE
  });
  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-inline');
  assert.equal(result.after.state, 'extracted');
  assert.ok(result.physicsSource.includes(DOMAIN_IMPORT_STATEMENT));
  assert.ok(result.physicsSource.includes(CENTER_OFFSET_CALL_BLOCK));
  assert.equal(result.physicsSource.includes(LEGACY_BLOCK), false);
});

test('reduces caller line count instead of hiding growth in the domain module', () => {
  const source = stagedPhysics();
  const result = analyzePhysicsCenterOffsetCutover({ physicsSource: source, domainSource: DOMAIN_SOURCE });
  assert.ok(result.physicsSource.split('\n').length < source.split('\n').length);
});

test('preserves player-position and camera-shake ordering', () => {
  const result = analyzePhysicsCenterOffsetCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const source = result.physicsSource;
  assert.ok(source.indexOf('const p = projectPlayer') < source.indexOf('const centerOffsetStep ='));
  assert.ok(source.indexOf('gameState.centerOffsetY = centerOffsetStep.centerOffsetY;') < source.indexOf('// Camera shake from speed'));
});

test('accepts an already extracted no-op', () => {
  const first = analyzePhysicsCenterOffsetCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const second = analyzePhysicsCenterOffsetCutover({ physicsSource: first.physicsSource, domainSource: DOMAIN_SOURCE });
  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects a missing import anchor', () => {
  assert.throws(() => transformPhysics(stagedPhysics({ includeAnchor: false })), /import anchor not found/);
});

test('rejects a partial extraction', () => {
  assert.throws(() => transformPhysics(
    stagedPhysics().replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`)
  ), /partial center-offset extraction/);
});

test('requires every exact replacement target to occur once', () => {
  assert.throws(() => replaceExactlyOnce('x x', 'x', 'y', 'fixture'), /appears more than once/);
  assert.throws(() => replaceExactlyOnce('abc', 'x', 'y', 'fixture'), /was not found/);
});

test('does not accept an extracted call without the domain import', () => {
  const first = analyzePhysicsCenterOffsetCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.throws(() => analyzePhysicsCenterOffsetCutover({
    physicsSource: first.physicsSource.replace(`import { calculateCenterOffsetStep } ${DOMAIN_IMPORT};\n`, ''),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
});
