import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_FACADE_PATH = 'js/api.js';
const API_DOMAIN_DIR = 'js/api';
const MAX_TOTAL_LINES = 850;
const MAX_DOMAIN_MODULE_LINES = 300;

function countSourceLines(source) {
  return String(source || '').replace(/\r\n/g, '\n').split('\n').length;
}

function analyzeApiDomainSizeBudget({ sources, maxTotalLines = MAX_TOTAL_LINES, maxDomainModuleLines = MAX_DOMAIN_MODULE_LINES }) {
  const entries = Object.entries(sources || {})
    .map(([path, source]) => ({ path, lines: countSourceLines(source) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (!entries.some((entry) => entry.path === API_FACADE_PATH)) {
    throw new Error(`${API_FACADE_PATH} is required for the API domain budget`);
  }

  const oversizedModules = entries.filter((entry) => entry.path !== API_FACADE_PATH && entry.lines > maxDomainModuleLines);
  const totalLines = entries.reduce((sum, entry) => sum + entry.lines, 0);

  if (oversizedModules.length > 0) {
    throw new Error(`API domain modules exceed ${maxDomainModuleLines} lines: ${oversizedModules.map((entry) => `${entry.path} (${entry.lines})`).join(', ')}`);
  }

  if (totalLines > maxTotalLines) {
    throw new Error(`API domain total exceeds ${maxTotalLines} lines: ${totalLines}`);
  }

  return {
    files: entries,
    fileCount: entries.length,
    totalLines,
    maxTotalLines,
    maxDomainModuleLines,
    remainingLines: maxTotalLines - totalLines
  };
}

function readApiDomainSources({ facadePath = API_FACADE_PATH, domainDir = API_DOMAIN_DIR } = {}) {
  const sources = {
    [facadePath]: readFileSync(facadePath, 'utf8')
  };

  for (const name of readdirSync(domainDir).filter((entry) => entry.endsWith('.js')).sort()) {
    const path = join(domainDir, name).replaceAll('\\', '/');
    sources[relative('.', path).replaceAll('\\', '/')] = readFileSync(path, 'utf8');
  }

  return sources;
}

function runApiDomainSizeBudget() {
  const report = analyzeApiDomainSizeBudget({ sources: readApiDomainSources() });
  console.log('API domain size budget');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runApiDomainSizeBudget();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  analyzeApiDomainSizeBudget,
  countSourceLines
};
