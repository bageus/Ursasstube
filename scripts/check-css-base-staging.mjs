import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_PATH = 'css/base.css';
const DEFAULT_STYLE_PATH = 'css/style.css';
const DEFAULT_MAIN_PATH = 'js/main.js';
const START_MARKER = '/* ===== TOKENS / BASE ===== */';
const NEXT_SECTION_MARKER = '/* ===== WALLET CORNER ===== */';
const BASE_IMPORT = "import '../css/base.css';";
const STYLE_IMPORT = "import '../css/style.css';";

function parseArgs(argv = process.argv.slice(2)) {
  return {
    basePath: argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length) || DEFAULT_BASE_PATH,
    stylePath: argv.find((arg) => arg.startsWith('--style='))?.slice('--style='.length) || DEFAULT_STYLE_PATH,
    mainPath: argv.find((arg) => arg.startsWith('--main='))?.slice('--main='.length) || DEFAULT_MAIN_PATH,
  };
}

function normalizeCss(source) {
  return String(source || '').replace(/\r\n/g, '\n').trimEnd();
}

function getStyleBaseBlock(styleSource) {
  const source = normalizeCss(styleSource);
  if (!source.startsWith(START_MARKER)) return null;

  const nextIndex = source.indexOf(NEXT_SECTION_MARKER);
  if (nextIndex <= 0) {
    throw new Error('css/style.css starts with base marker but has no WALLET CORNER marker');
  }

  return source.slice(0, nextIndex).trimEnd();
}

function getStyleState(styleSource) {
  const source = normalizeCss(styleSource);
  if (source.startsWith(START_MARKER)) return 'staged-duplicate';
  if (source.startsWith(NEXT_SECTION_MARKER)) return 'extracted';
  throw new Error('css/style.css must start with TOKENS / BASE or WALLET CORNER during Phase 2 base extraction');
}

function assertMainImportOrder(mainSource) {
  const baseIndex = mainSource.indexOf(BASE_IMPORT);
  const styleIndex = mainSource.indexOf(STYLE_IMPORT);

  if (baseIndex < 0) {
    throw new Error('js/main.js must import css/base.css');
  }
  if (styleIndex < 0) {
    throw new Error('js/main.js must import css/style.css');
  }
  if (baseIndex > styleIndex) {
    throw new Error('js/main.js must import css/base.css before css/style.css');
  }
}

function analyzeCssBaseStaging({ baseSource, styleSource, mainSource }) {
  assertMainImportOrder(String(mainSource || ''));

  const normalizedBase = normalizeCss(baseSource);
  const state = getStyleState(styleSource);
  const styleBaseBlock = getStyleBaseBlock(styleSource);

  if (state === 'staged-duplicate' && normalizedBase !== styleBaseBlock) {
    throw new Error('css/base.css must match the top base block in css/style.css before duplicate removal');
  }

  return {
    state,
    baseLines: normalizedBase.split('\n').length,
    hasStyleDuplicate: state === 'staged-duplicate',
  };
}

function runCssBaseStagingCheck(options = parseArgs()) {
  const result = analyzeCssBaseStaging({
    baseSource: readFileSync(options.basePath, 'utf8'),
    styleSource: readFileSync(options.stylePath, 'utf8'),
    mainSource: readFileSync(options.mainPath, 'utf8'),
  });

  console.log('CSS base staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function main(argv = process.argv.slice(2)) {
  return runCssBaseStagingCheck(parseArgs(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  BASE_IMPORT,
  NEXT_SECTION_MARKER,
  START_MARKER,
  STYLE_IMPORT,
  analyzeCssBaseStaging,
  getStyleBaseBlock,
  getStyleState,
  normalizeCss,
};
