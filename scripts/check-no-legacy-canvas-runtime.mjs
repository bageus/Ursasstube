import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targets = [
  'index.html',
  'js/game.js',
  'js/game/loop.js',
  'js/game/projection.js',
  'js/game/session.js',
  'js/renderers/index.js',
  'js/state.js'
];

const bannedPatterns = [
  /getCanvasSize\b/,
  /getCanvasDimensions\b/,
  /DOM\.canvas\b/,
  /invalidateCachedBackgroundGradient\b/,
  /<canvas\s+id=["']game["']/,
  /from\s+['"]\.\/renderer\.js['"]/
];

const violations = [];

for (const relPath of targets) {
  const absPath = path.join(rootDir, relPath);
  const source = readFileSync(absPath, 'utf8');

  for (const pattern of bannedPatterns) {
    if (pattern.test(source)) {
      violations.push(`${relPath}: matches ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error('❌ Legacy Canvas runtime patterns found:');
  for (const item of violations) {
    console.error(`   ${item}`);
  }
  process.exit(1);
}

console.log('✅ No legacy Canvas runtime patterns found in active Phaser runtime files.');
