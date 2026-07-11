import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  LEGACY_BLOCKS
} from './check-physics-progress-step-staging.mjs';
import {
  DISTANCE_APPLICATION,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  PROGRESS_CALL_BLOCK,
  SCORE_APPLICATION,
  analyzePhysicsProgressStepCutover,
  replaceExactlyOnce,
  transformPhysics
} from './cutover-physics-progress-step.mjs';

const DOMAIN_SOURCE = `const METERS_PER_SECOND_MULT = 300;
function calculateProgressStep({ distance, delta, speedStart, speedIncrementInterval, speedIncrementBoostDistance, speedIncrementBoostMultiplier, speedIncrement, speedMax, invertActive, invertScoreMultiplier }) {
  const speedLevel = Math.floor(distance / speedIncrementInterval);
  const speedIncrementMultiplier = distance >= speedIncrementBoostDistance ? speedIncrementBoostMultiplier : 1;
  const speed = Math.min(speedStart + speedLevel * speedIncrement * speedIncrementBoostMultiplier, speedMax);
  const metersDelta = speed * METERS_PER_SECOND_MULT * delta;
  const speedFactor = speed / speedStart;
  let pointsPerMeter = speedFactor;
  if (invertActive && invertScoreMultiplier > 1) pointsPerMeter *= invertScoreMultiplier;
  return { scoreDelta: metersDelta * pointsPerMeter };
}
export { calculateProgressStep };
`;

function stagedPhysics({ includeAnchor = true } = {}) {
  return `import { CONFIG } from './config.js';
${includeAnchor ? `${IMPORT_ANCHOR}\n` : ''}function update(delta) {
${LEGACY_BLOCKS.speed}
  gameState.tubeVisualSpeed += (gameState.speed - gameState.tubeVisualSpeed) * delta;
${LEGACY_BLOCKS.distance}
  const adaptiveProfile = getAdaptiveDifficultyProfile({ distance: gameState.distance });
  logger.debug(adaptiveProfile);
${LEGACY_BLOCKS.score}
  const coinSpacing = getSpacing('coin');
}`;
}

test('cuts over speed, distance and score ownership atomically', () => {
  const result = analyzePhysicsProgressStepCutover({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE
  });

  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-inline');
  assert.equal(result.after.state, 'extracted');
  assert.ok(result.physicsSource.includes(DOMAIN_IMPORT_STATEMENT));
  assert.ok(result.physicsSource.includes(PROGRESS_CALL_BLOCK));
  assert.ok(result.physicsSource.includes(DISTANCE_APPLICATION));
  assert.ok(result.physicsSource.includes(SCORE_APPLICATION));
  for (const block of Object.values(LEGACY_BLOCKS)) {
    assert.equal(result.physicsSource.includes(block), false);
  }
});

test('preserves tube-visual and adaptive-profile ordering around the extracted calculation', () => {
  const result = analyzePhysicsProgressStepCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const source = result.physicsSource;
  assert.ok(source.indexOf('gameState.speed = progressStep.speed;') < source.indexOf('gameState.tubeVisualSpeed +='));
  assert.ok(source.indexOf(DISTANCE_APPLICATION) < source.indexOf('const adaptiveProfile ='));
  assert.ok(source.indexOf('logger.debug(adaptiveProfile);') < source.indexOf(SCORE_APPLICATION));
  assert.ok(source.indexOf(SCORE_APPLICATION) < source.indexOf("getSpacing('coin')"));
});

test('accepts an already extracted no-op', () => {
  const first = analyzePhysicsProgressStepCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const second = analyzePhysicsProgressStepCutover({ physicsSource: first.physicsSource, domainSource: DOMAIN_SOURCE });
  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects partial legacy ownership before transforming', () => {
  assert.throws(() => analyzePhysicsProgressStepCutover({
    physicsSource: stagedPhysics().replace(LEGACY_BLOCKS.score, ''),
    domainSource: DOMAIN_SOURCE
  }), /partial legacy progress calculation/);
});

test('rejects a missing import anchor', () => {
  assert.throws(() => transformPhysics(stagedPhysics({ includeAnchor: false })), /import anchor not found/);
});

test('requires every replacement target to occur exactly once', () => {
  assert.throws(() => replaceExactlyOnce('x x', 'x', 'y', 'fixture'), /appears more than once/);
  assert.throws(() => replaceExactlyOnce('abc', 'x', 'y', 'fixture'), /was not found/);
});

test('does not accept an extracted call without the domain import', () => {
  const first = analyzePhysicsProgressStepCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.throws(() => analyzePhysicsProgressStepCutover({
    physicsSource: first.physicsSource.replace(`import { calculateProgressStep } ${DOMAIN_IMPORT};\n`, ''),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
});
