import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const buttonTags = [...html.matchAll(/<button\b[^>]*>/g)];
const legacyAllowed = new Set(['game-audio-btn', 'player-avatar-btn', 'pm-back-btn', 'link-btn']);

const violations = [];
for (const match of buttonTags) {
  const tag = match[0];
  const classMatch = tag.match(/class="([^"]*)"/);
  const classes = (classMatch?.[1] ?? '').split(/\s+/).filter(Boolean);
  const hasUi = classes.includes('ui-btn');
  const hasLegacyOnly = classes.some((cls) => legacyAllowed.has(cls));
  if (!hasUi && !hasLegacyOnly) violations.push(tag);
}

if (violations.length) {
  console.error('Buttons without .ui-btn found:');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exit(1);
}

console.log(`UI button check passed (${buttonTags.length} buttons scanned).`);
