import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const metadataSource = readFileSync('js/app-metadata.js', 'utf8');
const faviconSource = readFileSync('js/favicon-atlas.js', 'utf8');

test('app metadata uses shared runtime helper', () => {
  assert.match(metadataSource, /runtime-detection\.js/);
  assert.equal(metadataSource.includes('function is' + 'TelegramRuntime'), false);
});

test('atlas favicon ownership is independent of startup call order', () => {
  assert.equal(/ensureLink\(\s*['"]icon['"]/.test(metadataSource), false);
  assert.match(faviconSource, /querySelector\(['"]link\[rel=["']icon["']\]['"]\)/);
  assert.match(faviconSource, /setAtlasImageFallback\(\)/);
  assert.match(faviconSource, /canvas\.toDataURL\(['"]image\/png['"]\)/);
});
