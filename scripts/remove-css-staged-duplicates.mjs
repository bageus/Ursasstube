import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_STYLE_PATH = 'css/style.css';

const SECTION_SPECS = [
  {
    name: 'base',
    stagedPath: 'css/base.css',
    startMarker: '/* ===== TOKENS / BASE ===== */',
    nextMarker: '/* ===== WALLET CORNER ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'background',
    stagedPath: 'css/background.css',
    startMarker: '/* ===== BACKGROUND ===== */',
    nextMarker: '/* ===== HERO / BEAR ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'hero',
    stagedPath: 'css/hero.css',
    startMarker: '/* ===== HERO / BEAR ===== */',
    nextMarker: '/* ===== TITLE / BUTTONS ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'title-buttons',
    stagedPath: 'css/start-screen.css',
    startMarker: '/* ===== TITLE / BUTTONS ===== */',
    nextMarker: '/* ===== START HOOK ===== */',
    stagedMode: 'bounded',
  },
  {
    name: 'start-hook',
    stagedPath: 'css/start-screen.css',
    startMarker: '/* ===== START HOOK ===== */',
    nextMarker: '/* ===== LEADERBOARD ===== */',
    stagedMode: 'to-end',
  },
  {
    name: 'leaderboard',
    stagedPath: 'css/leaderboard.css',
    startMarker: '/* ===== LEADERBOARD ===== */',
    nextMarker: '/* ===== GAME START ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'gameplay',
    stagedPath: 'css/gameplay.css',
    startMarker: '/* ===== GAME START ===== */',
    nextMarker: '/* ===== GAME OVER ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'game-over-screen',
    stagedPath: 'css/game-over.css',
    startMarker: '/* ===== GAME OVER ===== */',
    nextMarker: '/* ===== STORE ===== */',
    stagedMode: 'bounded',
    stagedNextMarker: '/* ===== GAME OVER AUDIO NAV ===== */',
    ownershipGroup: 'game-over',
  },
  {
    name: 'store',
    stagedPath: 'css/store.css',
    startMarker: '/* ===== STORE ===== */',
    nextMarker: '/* ===== DARK SCREEN ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'rules',
    stagedPath: 'css/rules.css',
    startMarker: '/* ===== FOOTER RULES LINK ===== */',
    nextMarker: '/* ===== GAME OVER AUDIO NAV ===== */',
    stagedMode: 'whole',
  },
  {
    name: 'game-over-audio',
    stagedPath: 'css/game-over.css',
    startMarker: '/* ===== GAME OVER AUDIO NAV ===== */',
    nextMarker: '/* ===== ANIMATIONS ===== */',
    stagedMode: 'to-end',
    ownershipGroup: 'game-over',
  },
  {
    name: 'responsive',
    stagedPath: 'css/responsive.css',
    startMarker: '/* ===== RESPONSIVE ===== */',
    nextMarker: '/* ===== ICON ATLAS SPRITES ===== */',
    stagedMode: 'whole',
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;

  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    stylePath: readArg('style', DEFAULT_STYLE_PATH),
    basePath: readArg('base', 'css/base.css'),
    backgroundPath: readArg('background', 'css/background.css'),
    heroPath: readArg('hero', 'css/hero.css'),
    startScreenPath: readArg('start-screen', 'css/start-screen.css'),
    leaderboardPath: readArg('leaderboard', 'css/leaderboard.css'),
    gameplayPath: readArg('gameplay', 'css/gameplay.css'),
    gameOverPath: readArg('game-over', 'css/game-over.css'),
    storePath: readArg('store', 'css/store.css'),
    rulesPath: readArg('rules', 'css/rules.css'),
    responsivePath: readArg('responsive', 'css/responsive.css'),
  };
}

function normalizeCss(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBoundedSection(source, startMarker, nextMarker) {
  const normalizedSource = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalizedSource.indexOf(startMarker);
  if (startIndex < 0) return null;

  const nextIndex = normalizedSource.indexOf(nextMarker, startIndex + startMarker.length);
  if (nextIndex < 0) {
    throw new Error(`Found ${startMarker} but no following ${nextMarker}`);
  }

  return {
    startIndex,
    nextIndex,
    source: normalizedSource.slice(startIndex, nextIndex).trimEnd(),
  };
}

function extractStagedSection(stagedSource, spec) {
  const source = String(stagedSource || '').replace(/\r\n/g, '\n').trimEnd();

  if (spec.stagedMode === 'whole') {
    if (!source.includes(spec.startMarker)) {
      throw new Error(`${spec.stagedPath} must contain ${spec.startMarker}`);
    }
    return source;
  }

  const startIndex = source.indexOf(spec.startMarker);
  if (startIndex < 0) {
    throw new Error(`${spec.stagedPath} must contain ${spec.startMarker}`);
  }

  if (spec.stagedMode === 'to-end') {
    return source.slice(startIndex).trimEnd();
  }

  const nextMarker = spec.stagedNextMarker || spec.nextMarker;
  const nextIndex = source.indexOf(nextMarker, startIndex + spec.startMarker.length);
  if (nextIndex < 0) {
    throw new Error(`${spec.stagedPath} must contain ${nextMarker}`);
  }

  return source.slice(startIndex, nextIndex).trimEnd();
}

function resolveSpecPaths(options) {
  const pathByName = {
    base: options.basePath,
    background: options.backgroundPath,
    hero: options.heroPath,
    'title-buttons': options.startScreenPath,
    'start-hook': options.startScreenPath,
    leaderboard: options.leaderboardPath,
    gameplay: options.gameplayPath,
    'game-over-screen': options.gameOverPath,
    store: options.storePath,
    rules: options.rulesPath,
    'game-over-audio': options.gameOverPath,
    responsive: options.responsivePath,
  };

  return SECTION_SPECS.map((spec) => ({
    ...spec,
    stagedPath: pathByName[spec.name],
  }));
}

function assertOwnershipGroupsPresent(styleSource, specs) {
  const source = String(styleSource || '');
  const groups = new Map();

  for (const spec of specs) {
    if (!spec.ownershipGroup) continue;
    const states = groups.get(spec.ownershipGroup) || [];
    states.push({ name: spec.name, present: source.includes(spec.startMarker) });
    groups.set(spec.ownershipGroup, states);
  }

  for (const [group, states] of groups) {
    const presentCount = states.filter((state) => state.present).length;
    if (presentCount > 0 && presentCount < states.length) {
      throw new Error(`css/style.css has a partial ${group} extraction; ${states.map((state) => state.name).join(' and ')} must move together`);
    }
  }
}

function analyzeAndRemoveSections({ styleSource, stagedSources, specs = SECTION_SPECS }) {
  let nextStyle = String(styleSource || '').replace(/\r\n/g, '\n');
  const removed = [];
  const alreadyExtracted = [];

  assertOwnershipGroupsPresent(nextStyle, specs);

  for (const spec of specs) {
    const current = extractBoundedSection(nextStyle, spec.startMarker, spec.nextMarker);
    if (!current) {
      alreadyExtracted.push(spec.name);
      continue;
    }

    const stagedSource = stagedSources.get(spec.stagedPath);
    if (typeof stagedSource !== 'string') {
      throw new Error(`Missing staged CSS source for ${spec.stagedPath}`);
    }

    const stagedSection = extractStagedSection(stagedSource, spec);
    if (normalizeCss(current.source) !== normalizeCss(stagedSection)) {
      throw new Error(`${spec.name} section in css/style.css does not match ${spec.stagedPath}`);
    }

    const removedLines = current.source.split('\n').length;
    nextStyle = `${nextStyle.slice(0, current.startIndex)}${nextStyle.slice(current.nextIndex)}`
      .replace(/^\n+/, '')
      .replace(/\n{3,}/g, '\n\n');

    removed.push({
      name: spec.name,
      stagedPath: spec.stagedPath,
      removedLines,
    });
  }

  return {
    changed: removed.length > 0,
    styleSource: `${nextStyle.trimStart().trimEnd()}\n`,
    removed,
    alreadyExtracted,
    totalRemovedLines: removed.reduce((sum, item) => sum + item.removedLines, 0),
  };
}

function runRemoveCssStagedDuplicates(options = parseArgs()) {
  const specs = resolveSpecPaths(options);
  if (!existsSync(options.stylePath)) {
    throw new Error(`${options.stylePath} does not exist`);
  }

  const stagedSources = new Map();
  for (const spec of specs) {
    if (stagedSources.has(spec.stagedPath)) continue;
    if (!existsSync(spec.stagedPath)) {
      throw new Error(`${spec.stagedPath} does not exist`);
    }
    stagedSources.set(spec.stagedPath, readFileSync(spec.stagedPath, 'utf8'));
  }

  const result = analyzeAndRemoveSections({
    styleSource: readFileSync(options.stylePath, 'utf8'),
    stagedSources,
    specs,
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('All staged CSS sections are already extracted; pass --force or use --dry-run to accept a no-op');
  }

  if (result.changed && !options.dryRun) {
    writeFileSync(options.stylePath, result.styleSource);
  }

  const report = {
    stylePath: options.stylePath,
    dryRun: options.dryRun,
    changed: result.changed,
    removed: result.removed,
    alreadyExtracted: result.alreadyExtracted,
    totalRemovedLines: result.totalRemovedLines,
    nextStyleStartsWith: result.styleSource.split('\n')[0] || '',
  };

  console.log('CSS staged duplicate removal');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function main(argv = process.argv.slice(2)) {
  return runRemoveCssStagedDuplicates(parseArgs(argv));
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
  analyzeAndRemoveSections,
  extractBoundedSection,
  normalizeCss,
};
