import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const hooksDir = path.join(rootDir, '.git', 'hooks');
const preCommitHookPath = path.join(hooksDir, 'pre-commit');

const preCommitHookBody = `#!/usr/bin/env bash
set -euo pipefail

echo "[pre-commit] Running fast quality checks..."
npm run check:syntax
npm run check:static-analysis
`;

try {
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(preCommitHookPath, preCommitHookBody, 'utf8');
  chmodSync(preCommitHookPath, 0o755);
  console.log('✅ Installed git pre-commit hook at .git/hooks/pre-commit');
} catch (error) {
  console.warn('⚠️ Skipped pre-commit hook installation:', error.message);
}
