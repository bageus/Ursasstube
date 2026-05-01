import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10);

function run(cmd) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function listFiles(globCmd) {
  const out = run(globCmd);
  return out ? out.split('\n').filter(Boolean) : [];
}

const cssFiles = listFiles("rg --files css -g '*.css'");
const sourceFiles = listFiles("rg --files js css index.html terms privacy -g '*.js' -g '*.mjs' -g '*.css' -g '*.html'");
const assetFiles = listFiles("rg --files public/assets public/img");

const selectorCount = new Map();
const selectorRE = /^\s*([^@][^{]+)\{/gm;
for (const file of cssFiles) {
  const text = readFileSync(path.join(rootDir, file), 'utf8');
  let m;
  while ((m = selectorRE.exec(text)) !== null) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.includes('%')) continue;
    selectorCount.set(selector, (selectorCount.get(selector) ?? 0) + 1);
  }
}

const duplicateSelectors = [...selectorCount.entries()]
  .filter(([, count]) => count > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40);

const sourceText = sourceFiles.map((f) => readFileSync(path.join(rootDir, f), 'utf8')).join('\n');
const orphanAssets = [];
for (const file of assetFiles) {
  const webPath = `/${file.replace(/^public\//, '')}`;
  if (!sourceText.includes(webPath)) orphanAssets.push(file);
}

const report = {
  generatedAt: new Date().toISOString(),
  duplicateSelectorsTop: duplicateSelectors.map(([selector, count]) => ({ selector, count })),
  orphanAssetsCount: orphanAssets.length,
  orphanAssetsTop: orphanAssets.slice(0, 100),
  totals: {
    cssFiles: cssFiles.length,
    sourceFiles: sourceFiles.length,
    assets: assetFiles.length,
  },
};

writeFileSync(path.join(rootDir, 'docs/stage-c-audit-report-latest.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(rootDir, `docs/stage-c-audit-report-${today}.json`), JSON.stringify(report, null, 2) + '\n');
console.log('✅ Stage C audit report generated: docs/stage-c-audit-report-latest.json');
