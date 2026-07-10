import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_PATH = 'css/base.css';
const DEFAULT_STYLE_PATH = 'css/style.css';
const START_MARKER = '/* ===== TOKENS / BASE ===== */';
const NEXT_SECTION_MARKER = '/* ===== WALLET CORNER ===== */';

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    basePath: argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length) || DEFAULT_BASE_PATH,
    stylePath: argv.find((arg) => arg.startsWith('--style='))?.slice('--style='.length) || DEFAULT_STYLE_PATH,
  };
}

function normalizeCss(source) {
  return String(source || '').replace(/\r\n/g, '\n').trimEnd();
}

function removeBaseDuplicate({ baseSource, styleSource }) {
  const normalizedBase = normalizeCss(baseSource);
  const source = normalizeCss(styleSource);

  if (!normalizedBase.startsWith(START_MARKER)) {
    throw new Error('css/base.css must start with TOKENS / BASE');
  }

  if (source.startsWith(NEXT_SECTION_MARKER)) {
    return {
      changed: false,
      styleSource: `${source}\n`,
      removedLines: 0,
      nextStyleStartsWith: NEXT_SECTION_MARKER,
    };
  }

  if (!source.startsWith(START_MARKER)) {
    throw new Error('css/style.css must start with TOKENS / BASE or WALLET CORNER');
  }

  const nextIndex = source.indexOf(NEXT_SECTION_MARKER);
  if (nextIndex <= 0) {
    throw new Error('css/style.css starts with TOKENS / BASE but has no WALLET CORNER marker');
  }

  const styleBaseBlock = source.slice(0, nextIndex).trimEnd();
  if (styleBaseBlock !== normalizedBase) {
    throw new Error('css/style.css base block does not match css/base.css');
  }

  const nextStyle = `${source.slice(nextIndex).replace(/^\n+/, '')}\n`;
  return {
    changed: true,
    styleSource: nextStyle,
    removedLines: normalizedBase.split('\n').length,
    nextStyleStartsWith: nextStyle.split('\n')[0] || '',
  };
}

function runRemoveCssBaseDuplicate(options = parseArgs()) {
  const { dryRun, force, basePath, stylePath } = options;
  if (!existsSync(basePath)) {
    throw new Error(`${basePath} does not exist`);
  }

  const result = removeBaseDuplicate({
    baseSource: readFileSync(basePath, 'utf8'),
    styleSource: readFileSync(stylePath, 'utf8'),
  });

  const report = {
    stylePath,
    basePath,
    dryRun,
    changed: result.changed,
    removedLines: result.removedLines,
    nextStyleStartsWith: result.nextStyleStartsWith,
  };

  if (result.changed && !dryRun) {
    writeFileSync(stylePath, result.styleSource);
  }

  if (!result.changed && !force && !dryRun) {
    throw new Error('css/style.css already starts with WALLET CORNER; pass --force or use --dry-run to accept no-op');
  }

  return report;
}

function main(argv = process.argv.slice(2)) {
  const report = runRemoveCssBaseDuplicate(parseArgs(argv));
  console.log('CSS base duplicate removal');
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

export {
  NEXT_SECTION_MARKER,
  START_MARKER,
  normalizeCss,
  removeBaseDuplicate,
};
