import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  analyzeUnusedExports,
  collectModuleInfo
} from './check-unused-code.mjs';

test('ignores import and export text inside strings and templates', () => {
  const info = collectModuleInfo(`
    const fixture = \`export { fake }; import { ghost } from './ghost.js';\`;
    const quoted = "export { alsoFake }";
    const real = 1;
    export { real };
  `);

  assert.deepEqual([...info.exports], ['real']);
  assert.deepEqual(info.imports, []);
});

test('records direct re-exports as both facade exports and domain usage', () => {
  const info = collectModuleInfo(`export { alpha as publicAlpha } from './domain.js';`);
  assert.deepEqual([...info.exports], ['publicAlpha']);
  assert.deepEqual(info.imports, [{ source: './domain.js', names: ['alpha'] }]);
});

test('finds only genuinely unused exports across a re-export facade', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'unused-code-ast-'));
  mkdirSync(path.join(rootDir, 'js'), { recursive: true });

  writeFileSync(path.join(rootDir, 'js/domain.js'), `
    export const alpha = 1;
    export const unused = 2;
    const fixture = \`export { fake }; import { ghost } from './ghost.js';\`;
  `);
  writeFileSync(path.join(rootDir, 'js/facade.js'), `export { alpha } from './domain.js';\n`);
  writeFileSync(path.join(rootDir, 'js/consumer.js'), `import { alpha } from './facade.js';\nconsole.log(alpha);\n`);

  const unused = analyzeUnusedExports({
    rootDir,
    files: ['js/domain.js', 'js/facade.js', 'js/consumer.js'],
    baseline: new Set()
  });

  assert.deepEqual(unused, ['js/domain.js:unused']);
});
