import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const bundledPath = path.join(rootDir, 'css/web-menu-layout.css');
const publicPath = path.join(rootDir, 'public/css/web-menu-layout.css');

const hasBundledCopy = existsSync(bundledPath);
const hasPublicCopy = existsSync(publicPath);

if (hasBundledCopy && hasPublicCopy) {
  console.error('Duplicate web layout stylesheets detected.');
  console.error('- css/web-menu-layout.css');
  console.error('- public/css/web-menu-layout.css');
  console.error('Keep one delivery path so web menu/profile overrides do not drift.');
  process.exit(1);
}

console.log('✅ No duplicate web layout stylesheet detected.');
