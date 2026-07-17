import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  NEXT_MARKER,
  START_MARKER,
  analyzePhysicsCollisionPhaseStaging
} from './check-physics-collision-phase-staging.mjs';

const SECTION = `${START_MARKER}
  fence: { start: 28, end: 45 }
});
function isObstacleInCollisionPhase(subtype, z, zMin, zMax) {
  return Boolean(subtype && Number.isFinite(z) && zMax > zMin);
}`;
const EXPORT_BLOCK = `export {
  OBSTACLE_COLLISION_PHASE_WINDOW,
  isObstacleInCollisionPhase
};`;

function physicsSource(section = SECTION, importLine = '') {
  return `${importLine}${importLine ? '\n' : ''}${section}\n${NEXT_MARKER} (index) => index;\n`;
}

function domainSource(section = SECTION, exportBlock = EXPORT_BLOCK) {
  return `${section}\n\n${exportBlock}\n`;
}

test('accepts a matching staged collision phase duplicate', () => {
  const result = analyzePhysicsCollisionPhaseStaging({
    physicsSource: physicsSource(),
    domainSource: domainSource()
  });
  assert.equal(result.state, 'staged-duplicate');
  assert.equal(result.hasDomainImport, false);
});

test('accepts the extracted collision phase state', () => {
  const result = analyzePhysicsCollisionPhaseStaging({
    physicsSource: `${DOMAIN_IMPORT};\n${NEXT_MARKER} (index) => index;\n`,
    domainSource: domainSource()
  });
  assert.deepEqual(result, { state: 'extracted', hasDomainImport: true });
});

test('rejects staged collision phase drift', () => {
  assert.throws(() => analyzePhysicsCollisionPhaseStaging({
    physicsSource: physicsSource(),
    domainSource: domainSource(SECTION.replace('start: 28', 'start: 29'))
  }), /must match the collision phase section/);
});

test('rejects partial extraction with import and local implementation', () => {
  assert.throws(() => analyzePhysicsCollisionPhaseStaging({
    physicsSource: physicsSource(SECTION, DOMAIN_IMPORT),
    domainSource: domainSource()
  }), /partial collision phase extraction/);
});

test('requires the domain import after local extraction', () => {
  assert.throws(() => analyzePhysicsCollisionPhaseStaging({
    physicsSource: `${NEXT_MARKER} (index) => index;\n`,
    domainSource: domainSource()
  }), /must import js\/physics\/collision-phase\.js/);
});

test('requires the complete export inventory', () => {
  assert.throws(() => analyzePhysicsCollisionPhaseStaging({
    physicsSource: physicsSource(),
    domainSource: domainSource(SECTION, 'export { isObstacleInCollisionPhase };')
  }), /must export OBSTACLE_COLLISION_PHASE_WINDOW/);
});
