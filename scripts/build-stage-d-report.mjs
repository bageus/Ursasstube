import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10);

const BASELINE = Object.freeze({
  unusedExports: 1,
  implicitGlobalWrites: 3,
  oversizedModules: 0,
});

function run(cmd) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function listRootJsFiles() {
  const out = run("rg --files js -g '*.js' -g '*.mjs'");
  return out.split('\n').filter((f) => /^js\/[^/]+\.js$/.test(f));
}

const rootJsFiles = listRootJsFiles();
const deprecatedCandidates = rootJsFiles.filter((f) => !['js/main.js', 'js/game-runtime.js'].includes(f));

const report = {
  generatedAt: new Date().toISOString(),
  stage: 'D',
  month: today.slice(0, 7),
  deprecatedCandidates: {
    count: deprecatedCandidates.length,
    files: deprecatedCandidates,
  },
  baseline: BASELINE,
  progress: {
    unusedExportsDelta: 0,
    implicitGlobalWritesDelta: 0,
    oversizedModulesDelta: 0,
  },
  actions: [
    'Назначить owner для каждого deprecated candidate в js root.',
    'Перенести кандидаты в feature/core директории или оформить адаптеры.',
    'Снизить baseline implicit global writes с 3 до 2 в следующем цикле.',
  ],
};

writeFileSync(path.join(rootDir, 'docs/stage-d-burndown-latest.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(rootDir, `docs/stage-d-burndown-${today}.json`), JSON.stringify(report, null, 2) + '\n');
console.log('✅ Stage D burndown report generated.');
