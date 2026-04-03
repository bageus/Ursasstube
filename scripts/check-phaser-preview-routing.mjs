#!/usr/bin/env node
import { buildPhaserPreviewUrl, shouldRedirectToPhaserPreviewFromUrl } from '../js/phaser-preview-routing.js';

const cases = [
  {
    url: 'https://example.com/',
    redirect: true,
    target: 'https://example.com/phaser/'
  },
  {
    url: 'https://example.com/index.html#debug',
    redirect: true,
    target: 'https://example.com/phaser/#debug'
  },
  {
    url: 'https://example.com/?renderer=phaser',
    redirect: true,
    target: 'https://example.com/phaser/?renderer=phaser'
  },
  {
    url: 'https://example.com/index.html?renderer=phaser#debug',
    redirect: true,
    target: 'https://example.com/phaser/?renderer=phaser#debug'
  },
  {
    url: 'https://example.com/?renderer=phaser&phaser_preview_redirect=off',
    redirect: false
  },
  {
    url: 'https://example.com/phaser/?renderer=phaser',
    redirect: false
  },
  {
    url: 'https://example.com/store?renderer=phaser',
    redirect: false
  },
  {
    url: 'https://example.com/?renderer=canvas',
    redirect: false
  }
];

for (const testCase of cases) {
  const shouldRedirect = shouldRedirectToPhaserPreviewFromUrl(testCase.url);
  if (shouldRedirect !== testCase.redirect) {
    throw new Error(`Routing assertion failed for ${testCase.url}: expected redirect=${testCase.redirect}, got ${shouldRedirect}`);
  }

  if (testCase.redirect) {
    const built = buildPhaserPreviewUrl(testCase.url).toString();
    if (built !== testCase.target) {
      throw new Error(`Target URL mismatch for ${testCase.url}: expected ${testCase.target}, got ${built}`);
    }
  }
}

console.log(`✅ Phaser preview routing check passed (${cases.length} scenarios).`);
