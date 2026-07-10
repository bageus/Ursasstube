import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('app metadata uses shared runtime helper', () => {
  const source = readFileSync('js/app-metadata.js', 'utf8');
  assert.match(source, /runtime-detection\.js/);
  assert.equal(source.includes('function is' + 'TelegramRuntime'), false);
});
