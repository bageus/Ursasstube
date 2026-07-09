import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('startup performance uses config runtime flag', () => {
  const source = readFileSync('js/startup-performance.js', 'utf8');
  assert.match(source, /config\.js/);
  assert.equal(source.includes('function is' + 'TelegramRuntime'), false);
});
