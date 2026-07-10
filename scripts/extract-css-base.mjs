import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_STYLE_PATH = 'css/style.css';
const DEFAULT_BASE_PATH = 'css/base.css';
const START_MARKER = '/* ===== TOKENS / BASE ===== */';
const NEXT_SECTION_MARKER = '/* ===== WALLET CORNER ===== */';
const IMPORT_LINE = "@import './base.css';";

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    stylePath: argv.find((arg) => arg.startsWith('--style='))?.slice('--style='.length) || DEFAULT_STYLE_PATH,
    basePath: argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length) || DEFAULT_BASE_PATH,
  };
}

function buildBaseExtraction(styleSource) {
  const source = String(styleSource || '');
  if (source.includes(IMPORT_LINE)) {
    throw new Error('style.css already imports css/base.css');
  }

  const startIndex = source.indexOf(START_MARKER);
  if (startIndex !== 0) {
    throw new Error('style.css must start with the TOKENS / BASE section marker');
  }

  const nextIndex = source.indexOf(NEXT_SECTION_MARKER);
  if (nextIndex <= startIndex) {
    throw new Error('Could not find WALLET CORNER section marker after the base block');
  }

  const baseSource = source.slice(startIndex, nextIndex).trimEnd() + '\n';
  const remainingSource = source.slice(nextIndex).replace(/^\n+/, '');
  const nextStyleSource = `${IMPORT_LINE}\n\n${remainingSource}`;

  return {
    baseSource,
    styleSource: nextStyleSource,
    baseLines: baseSource.split('\n').length,
    nextStyleStartsWith: remainingSource.split('\n')[0] || '',
  };
}

function runCssBaseExtraction(options = parseArgs()) {
  const { dryRun, force, stylePath, basePath } = options;
  if (existsSync(basePath) && !force) {
    throw new Error(`${basePath} already exists; pass --force to overwrite it`);
  }

  const styleSource = readFileSync(stylePath, 'utf8');
  const result = buildBaseExtraction(styleSource);

  const report = {
    stylePath,
    basePath,
    dryRun,
    baseLines: result.baseLines,
    nextStyleStartsWith: result.nextStyleStartsWith,
  };

  if (!dryRun) {
    writeFileSync(basePath, result.baseSource);
    writeFileSync(stylePath, result.styleSource);
  }

  return report;
}

function main(argv = process.argv.slice(2)) {
  const report = runCssBaseExtraction(parseArgs(argv));
  console.log('CSS base extraction');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}
