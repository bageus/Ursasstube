import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = new URL('..', import.meta.url).pathname;
const skipDirs = new Set(['node_modules', '.git', 'dist', 'vendor']);

function collectHtmlFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      collectHtmlFiles(join(dir, entry.name), acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) acc.push(join(dir, entry.name));
  }
  return acc;
}

const htmlFiles = collectHtmlFiles(rootDir);
const violations = [];
let buttonCount = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const buttonTags = [...html.matchAll(/<button\b[^>]*>/g)];
  buttonCount += buttonTags.length;

  for (const match of buttonTags) {
    const tag = match[0];
    if (tag.includes('data-ui-exempt="true"')) continue;
    const classMatch = tag.match(/class="([^"]*)"/);
    const classes = (classMatch?.[1] ?? '').split(/\s+/).filter(Boolean);
    const hasUi = classes.includes('ui-btn');
    if (!hasUi) violations.push({ file, tag });
  }
}

if (violations.length) {
  console.error('Buttons without .ui-btn found (use .ui-btn or add data-ui-exempt=\"true\"):');
  violations.forEach(({ file, tag }) => console.error(`- ${file}: ${tag}`));
  process.exit(1);
}

console.log(`UI button check passed (${buttonCount} buttons scanned in ${htmlFiles.length} HTML files).`);
