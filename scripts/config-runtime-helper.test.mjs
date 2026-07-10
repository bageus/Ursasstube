import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('config uses shared runtime helper', () => {
  const source = readFileSync('js/config.js', 'utf8');
  assert.match(source, /runtime-detection\.js/);
  assert.equal(source.includes('function is' + 'TelegramRuntime'), false);
});
