import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  NEXT_MARKER,
  START_MARKER,
  analyzeBootstrapRankFeedbackStaging
} from './check-bootstrap-rank-feedback-staging.mjs';

const DEFAULT_BOOTSTRAP_PATH = 'js/game/bootstrap.js';
const DEFAULT_DOMAIN_PATH = 'js/game/bootstrap/rank-feedback.js';
const EXPORT_MARKER = '\nexport {';
const IMPORT_ANCHOR = "import { markGameRuntimeReady } from '../app-loading.js';";
const DOMAIN_IMPORT_STATEMENT = "import { buildTakeBackSub, showRankLossToast } from './bootstrap/rank-feedback.js';";
const DOMAIN_EXPORT_BLOCK = `export {
  buildTakeBackSub,
  showRankLossToast
};`;

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    bootstrapPath: readArg('bootstrap', DEFAULT_BOOTSTRAP_PATH),
    domainPath: readArg('domain', DEFAULT_DOMAIN_PATH)
  };
}

function transformBootstrap(bootstrapSource) {
  let source = String(bootstrapSource || '').replace(/\r\n/g, '\n');
  const startIndex = source.indexOf(START_MARKER);

  if (startIndex < 0) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_BOOTSTRAP_PATH} has no rank watcher section and no rank feedback import`);
    }
    return { changed: false, source };
  }

  const nextIndex = source.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) {
    throw new Error(`${DEFAULT_BOOTSTRAP_PATH} contains ${START_MARKER} but no ${NEXT_MARKER}`);
  }

  if (source.includes(DOMAIN_IMPORT)) {
    throw new Error(`${DEFAULT_BOOTSTRAP_PATH} has a partial rank feedback extraction`);
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(`Bootstrap rank feedback import anchor not found: ${IMPORT_ANCHOR}`);
  }

  source = source.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`);
  const updatedStartIndex = source.indexOf(START_MARKER);
  const updatedNextIndex = source.indexOf(NEXT_MARKER, updatedStartIndex + START_MARKER.length);
  source = `${source.slice(0, updatedStartIndex)}${source.slice(updatedNextIndex)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return { changed: true, source: `${source}\n` };
}

function assertDomainExportBlock(source) {
  const exportIndex = source.lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) return false;
  const exportBlock = source.slice(exportIndex);
  for (const name of ['buildTakeBackSub', 'showRankLossToast']) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DEFAULT_DOMAIN_PATH} export block is incomplete: ${name}`);
    }
  }
  return true;
}

function transformDomain(domainSource) {
  const source = String(domainSource || '').replace(/\r\n/g, '\n').trimEnd();
  if (!source.includes(START_MARKER)) {
    throw new Error(`${DEFAULT_DOMAIN_PATH} must contain ${START_MARKER}`);
  }

  if (assertDomainExportBlock(source)) {
    return { changed: false, source: `${source}\n` };
  }

  return {
    changed: true,
    source: `${source}\n\n${DOMAIN_EXPORT_BLOCK}\n`
  };
}

function analyzeBootstrapRankFeedbackCutover({ bootstrapSource, domainSource }) {
  const before = analyzeBootstrapRankFeedbackStaging({ bootstrapSource, domainSource });
  const bootstrapResult = transformBootstrap(bootstrapSource);
  const domainResult = transformDomain(domainSource);

  if (before.state === 'extracted' && !bootstrapResult.changed && !domainResult.changed) {
    return {
      changed: false,
      bootstrapSource: bootstrapResult.source,
      domainSource: domainResult.source,
      before,
      after: before
    };
  }

  const after = analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: bootstrapResult.source,
    domainSource: domainResult.source
  });

  if (after.state !== 'extracted') {
    throw new Error('Bootstrap rank feedback cutover did not reach extracted state');
  }

  return {
    changed: bootstrapResult.changed || domainResult.changed,
    bootstrapSource: bootstrapResult.source,
    domainSource: domainResult.source,
    before,
    after
  };
}

function runBootstrapRankFeedbackCutover(options = parseArgs()) {
  for (const path of [options.bootstrapPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzeBootstrapRankFeedbackCutover({
    bootstrapSource: readFileSync(options.bootstrapPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Bootstrap rank feedback is already extracted; pass --force or use --dry-run to accept a no-op');
  }

  if (result.changed && !options.dryRun) {
    writeFileSync(options.bootstrapPath, result.bootstrapSource);
    writeFileSync(options.domainPath, result.domainSource);
  }

  const report = {
    dryRun: options.dryRun,
    changed: result.changed,
    before: result.before.state,
    after: result.after.state,
    bootstrapLines: result.bootstrapSource.split('\n').length,
    domainLines: result.domainSource.split('\n').length
  };

  console.log('Bootstrap rank feedback cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runBootstrapRankFeedbackCutover(parseArgs());
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  analyzeBootstrapRankFeedbackCutover,
  transformBootstrap,
  transformDomain
};
