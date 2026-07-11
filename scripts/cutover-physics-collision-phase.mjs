import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  NEXT_MARKER,
  START_MARKER,
  analyzePhysicsCollisionPhaseStaging
} from './check-physics-collision-phase-staging.mjs';

const DEFAULT_PHYSICS_PATH = 'js/physics.js';
const DEFAULT_DOMAIN_PATH = 'js/physics/collision-phase.js';
const IMPORT_ANCHOR = "import { getAdaptiveDifficultyProfile } from './game/adaptive-difficulty.js';";
const DOMAIN_IMPORT_STATEMENT = "import { isObstacleInCollisionPhase } from './physics/collision-phase.js';";

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    physicsPath: readArg('physics', DEFAULT_PHYSICS_PATH),
    domainPath: readArg('domain', DEFAULT_DOMAIN_PATH)
  };
}

function transformPhysics(physicsSource) {
  let source = String(physicsSource || '').replace(/\r\n/g, '\n');
  const startIndex = source.indexOf(START_MARKER);

  if (startIndex < 0) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_PHYSICS_PATH} has no collision phase section and no domain import`);
    }
    return { changed: false, source };
  }

  const nextIndex = source.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) {
    throw new Error(`${DEFAULT_PHYSICS_PATH} contains the collision phase table but no ${NEXT_MARKER}`);
  }
  if (source.includes(DOMAIN_IMPORT)) {
    throw new Error(`${DEFAULT_PHYSICS_PATH} has a partial collision phase extraction`);
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(`Physics collision phase import anchor not found: ${IMPORT_ANCHOR}`);
  }

  source = source.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`);
  const updatedStartIndex = source.indexOf(START_MARKER);
  const updatedNextIndex = source.indexOf(NEXT_MARKER, updatedStartIndex + START_MARKER.length);
  source = `${source.slice(0, updatedStartIndex)}${source.slice(updatedNextIndex)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return { changed: true, source: `${source}\n` };
}

function analyzePhysicsCollisionPhaseCutover({ physicsSource, domainSource }) {
  const before = analyzePhysicsCollisionPhaseStaging({ physicsSource, domainSource });
  const physicsResult = transformPhysics(physicsSource);

  if (before.state === 'extracted' && !physicsResult.changed) {
    return {
      changed: false,
      physicsSource: physicsResult.source,
      domainSource: String(domainSource || '').replace(/\r\n/g, '\n'),
      before,
      after: before
    };
  }

  const after = analyzePhysicsCollisionPhaseStaging({
    physicsSource: physicsResult.source,
    domainSource
  });
  if (after.state !== 'extracted') {
    throw new Error('Physics collision phase cutover did not reach extracted state');
  }

  return {
    changed: physicsResult.changed,
    physicsSource: physicsResult.source,
    domainSource: String(domainSource || '').replace(/\r\n/g, '\n'),
    before,
    after
  };
}

function runPhysicsCollisionPhaseCutover(options = parseArgs()) {
  for (const path of [options.physicsPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzePhysicsCollisionPhaseCutover({
    physicsSource: readFileSync(options.physicsPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Physics collision phase is already extracted; pass --force or use --dry-run to accept a no-op');
  }
  if (result.changed && !options.dryRun) {
    writeFileSync(options.physicsPath, result.physicsSource);
  }

  const report = {
    dryRun: options.dryRun,
    changed: result.changed,
    before: result.before.state,
    after: result.after.state,
    physicsLines: result.physicsSource.split('\n').length
  };
  console.log('Physics collision phase cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPhysicsCollisionPhaseCutover(parseArgs());
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  analyzePhysicsCollisionPhaseCutover,
  transformPhysics
};
