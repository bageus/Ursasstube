import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHYSICS_PATH = 'js/physics.js';
const DOMAIN_PATH = 'js/physics/collision-phase.js';
const START_MARKER = 'const OBSTACLE_COLLISION_PHASE_WINDOW = Object.freeze({';
const NEXT_MARKER = 'const removeCoinAt =';
const DOMAIN_IMPORT = "from './physics/collision-phase.js'";
const EXPORT_MARKER = '\nexport {';
const REQUIRED_EXPORTS = [
  'OBSTACLE_COLLISION_PHASE_WINDOW',
  'isObstacleInCollisionPhase'
];

function normalizeSource(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPhysicsSection(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(START_MARKER);
  if (startIndex < 0) return null;
  const nextIndex = normalized.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) throw new Error(`${PHYSICS_PATH} contains the collision phase table but no ${NEXT_MARKER}`);
  return normalized.slice(startIndex, nextIndex).trimEnd();
}

function extractDomainSection(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(START_MARKER);
  if (startIndex < 0) return null;
  const exportIndex = normalized.indexOf(EXPORT_MARKER, startIndex + START_MARKER.length);
  if (exportIndex < 0) throw new Error(`${DOMAIN_PATH} must include an export block`);
  return normalized.slice(startIndex, exportIndex).trimEnd();
}

function assertDomainExports(domainSource) {
  const exportIndex = String(domainSource || '').lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) throw new Error(`${DOMAIN_PATH} must include an export block`);
  const exportBlock = domainSource.slice(exportIndex);
  for (const name of REQUIRED_EXPORTS) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DOMAIN_PATH} must export ${name}`);
    }
  }
}

function analyzePhysicsCollisionPhaseStaging({ physicsSource, domainSource }) {
  const physicsSection = extractPhysicsSection(physicsSource);
  const domainSection = extractDomainSection(domainSource);
  if (!domainSection) throw new Error(`${DOMAIN_PATH} must contain the collision phase table`);
  assertDomainExports(domainSource);

  const hasDomainImport = String(physicsSource || '').includes(DOMAIN_IMPORT);
  if (!physicsSection) {
    if (!hasDomainImport) {
      throw new Error(`${PHYSICS_PATH} must import ${DOMAIN_PATH} after collision phase extraction`);
    }
    return { state: 'extracted', hasDomainImport: true };
  }

  if (hasDomainImport) {
    throw new Error(`${PHYSICS_PATH} has a partial collision phase extraction`);
  }
  if (normalizeSource(physicsSection) !== normalizeSource(domainSection)) {
    throw new Error(`${DOMAIN_PATH} must match the collision phase section in ${PHYSICS_PATH}`);
  }

  return {
    state: 'staged-duplicate',
    hasDomainImport: false,
    lines: domainSection.split('\n').length
  };
}

function runPhysicsCollisionPhaseStagingCheck() {
  const result = analyzePhysicsCollisionPhaseStaging({
    physicsSource: readFileSync(PHYSICS_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Physics collision phase staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPhysicsCollisionPhaseStagingCheck();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_IMPORT,
  NEXT_MARKER,
  START_MARKER,
  analyzePhysicsCollisionPhaseStaging
};
