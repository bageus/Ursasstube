import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  LEGACY_BLOCK
} from './check-physics-camera-shake-staging.mjs';
import {
  CAMERA_SHAKE_CALL_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHORS,
  analyzePhysicsCameraShakeCutover,
  findImportAnchor,
  replaceExactlyOnce,
  transformPhysics
} from './cutover-physics-camera-shake.mjs';

const DOMAIN_SOURCE = `function calculateCameraShakeStep({ gameState, adaptiveProfile, config, delta, cameraShakeSmoothing, randomX, randomY }) {
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
export { calculateCameraShakeStep };
`;

function stagedPhysics({ centerOffsetExtracted = false, includeAnchor = true } = {}) {
  const progressImport = includeAnchor ? `${IMPORT_ANCHORS[1]}\n` : '';
  const centerImport = centerOffsetExtracted ? `${IMPORT_ANCHORS[0]}\n` : '';
  return `${progressImport}${centerImport}function update(delta) {
  gameState.centerOffsetX += delta;
${LEGACY_BLOCK}
  const collisionDepthMin = 1;
}`;
}

test('cuts over camera-shake ownership atomically', () => {
  const result = analyzePhysicsCameraShakeCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-inline');
  assert.equal(result.after.state, 'extracted');
  assert.ok(result.physicsSource.includes(DOMAIN_IMPORT_STATEMENT));
  assert.ok(result.physicsSource.includes(CAMERA_SHAKE_CALL_BLOCK));
  assert.equal(result.physicsSource.includes(LEGACY_BLOCK), false);
});

test('uses the center-offset import when that cutover already happened', () => {
  const source = stagedPhysics({ centerOffsetExtracted: true });
  assert.equal(findImportAnchor(source), IMPORT_ANCHORS[0]);
  const result = analyzePhysicsCameraShakeCutover({ physicsSource: source, domainSource: DOMAIN_SOURCE });
  assert.ok(result.physicsSource.indexOf(IMPORT_ANCHORS[0]) < result.physicsSource.indexOf(DOMAIN_IMPORT_STATEMENT));
});

test('falls back to the progress import before center-offset extraction', () => {
  const source = stagedPhysics();
  assert.equal(findImportAnchor(source), IMPORT_ANCHORS[1]);
  const result = analyzePhysicsCameraShakeCutover({ physicsSource: source, domainSource: DOMAIN_SOURCE });
  assert.ok(result.physicsSource.indexOf(IMPORT_ANCHORS[1]) < result.physicsSource.indexOf(DOMAIN_IMPORT_STATEMENT));
});

test('preserves center-offset and collision-depth ordering', () => {
  const result = analyzePhysicsCameraShakeCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const source = result.physicsSource;
  assert.ok(source.indexOf('gameState.centerOffsetX += delta;') < source.indexOf('const cameraShakeStep ='));
  assert.ok(source.indexOf('gameState.renderCenterOffsetY = cameraShakeStep.renderCenterOffsetY;') < source.indexOf('const collisionDepthMin ='));
});

test('accepts an already extracted no-op', () => {
  const first = analyzePhysicsCameraShakeCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const second = analyzePhysicsCameraShakeCutover({ physicsSource: first.physicsSource, domainSource: DOMAIN_SOURCE });
  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects missing anchors and partial extraction', () => {
  assert.throws(() => transformPhysics(stagedPhysics({ includeAnchor: false })), /import anchor not found/);
  assert.throws(() => transformPhysics(
    stagedPhysics().replace(IMPORT_ANCHORS[1], `${IMPORT_ANCHORS[1]}\n${DOMAIN_IMPORT_STATEMENT}`)
  ), /partial camera-shake extraction/);
});

test('requires exact replacement targets and the final import contract', () => {
  assert.throws(() => replaceExactlyOnce('x x', 'x', 'y', 'fixture'), /appears more than once/);
  assert.throws(() => replaceExactlyOnce('abc', 'x', 'y', 'fixture'), /was not found/);
  const first = analyzePhysicsCameraShakeCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.throws(() => analyzePhysicsCameraShakeCutover({
    physicsSource: first.physicsSource.replace(`import { calculateCameraShakeStep } ${DOMAIN_IMPORT};\n`, ''),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
});

test('reduces the caller line count', () => {
  const before = stagedPhysics().split('\n').length;
  const result = analyzePhysicsCameraShakeCutover({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  const after = result.physicsSource.split('\n').length;
  assert.ok(after < before, `${after} should be lower than ${before}`);
});
