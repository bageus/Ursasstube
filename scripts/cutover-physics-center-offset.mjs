import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  LEGACY_BLOCK,
  analyzePhysicsCenterOffsetStaging
} from './check-physics-center-offset-staging.mjs';

const DEFAULT_PHYSICS_PATH = 'js/physics.js';
const DEFAULT_DOMAIN_PATH = 'js/physics/center-offset-step.js';
const IMPORT_ANCHOR = "import { calculateProgressStep } from './physics/progress-step.js';";
const DOMAIN_IMPORT_STATEMENT = "import { calculateCenterOffsetStep } from './physics/center-offset-step.js';";
const CENTER_OFFSET_CALL_BLOCK = `  const centerOffsetStep = calculateCenterOffsetStep({ gameState, adaptiveProfile, config: CONFIG, delta });
  gameState.centerOffsetX = centerOffsetStep.centerOffsetX;
  gameState.centerOffsetY = centerOffsetStep.centerOffsetY;`;

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    physicsPath: readArg('physics', DEFAULT_PHYSICS_PATH),
    domainPath: readArg('domain', DEFAULT_DOMAIN_PATH)
  };
}

function replaceExactlyOnce(source, target, replacement, label) {
  const firstIndex = source.indexOf(target);
  if (firstIndex < 0) throw new Error(`${label} was not found`);
  if (source.indexOf(target, firstIndex + target.length) >= 0) {
    throw new Error(`${label} appears more than once`);
  }
  return source.replace(target, replacement);
}

function transformPhysics(physicsSource) {
  let source = String(physicsSource || '').replace(/\r\n/g, '\n');
  const hasLegacyBlock = source.includes(LEGACY_BLOCK);

  if (!hasLegacyBlock) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_PHYSICS_PATH} has no legacy center-offset block and no domain import`);
    }
    return { changed: false, source };
  }

  if (source.includes(DOMAIN_IMPORT)) {
    throw new Error(`${DEFAULT_PHYSICS_PATH} has a partial center-offset extraction`);
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(`Physics center-offset import anchor not found: ${IMPORT_ANCHOR}`);
  }

  source = replaceExactlyOnce(
    source,
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`,
    'Physics center-offset import anchor'
  );
  source = replaceExactlyOnce(source, LEGACY_BLOCK, CENTER_OFFSET_CALL_BLOCK, 'Legacy center-offset block');

  return { changed: true, source: `${source.trimEnd()}\n` };
}

function analyzePhysicsCenterOffsetCutover({ physicsSource, domainSource }) {
  const before = analyzePhysicsCenterOffsetStaging({ physicsSource, domainSource });
  const transformed = transformPhysics(physicsSource);

  if (before.state === 'extracted' && !transformed.changed) {
    return {
      changed: false,
      physicsSource: transformed.source,
      before,
      after: before
    };
  }

  const after = analyzePhysicsCenterOffsetStaging({
    physicsSource: transformed.source,
    domainSource
  });
  if (after.state !== 'extracted') {
    throw new Error('Physics center-offset cutover did not reach extracted state');
  }

  return {
    changed: transformed.changed,
    physicsSource: transformed.source,
    before,
    after
  };
}

function runPhysicsCenterOffsetCutover(options = parseArgs()) {
  for (const path of [options.physicsPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzePhysicsCenterOffsetCutover({
    physicsSource: readFileSync(options.physicsPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Physics center offset is already extracted; pass --force or use --dry-run to accept a no-op');
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
  console.log('Physics center offset cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runPhysicsCenterOffsetCutover(parseArgs()); }
  catch (error) { console.error(error?.message || error); process.exit(1); }
}

export {
  CENTER_OFFSET_CALL_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  analyzePhysicsCenterOffsetCutover,
  replaceExactlyOnce,
  transformPhysics
};
