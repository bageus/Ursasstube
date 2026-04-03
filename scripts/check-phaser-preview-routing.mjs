#!/usr/bin/env node
import { buildPhaserPreviewUrl, shouldUsePhaserRendererFromUrl } from '../js/phaser-preview-routing.js';

const cases = [
  {
    url: 'https://example.com/',
    usePhaser: false
  },
  {
    url: 'https://example.com/index.html#debug',
    usePhaser: false
  },
  {
    url: 'https://example.com/?renderer=phaser',
    usePhaser: true
  },
  {
    url: 'https://example.com/index.html?renderer=phaser#debug',
    usePhaser: true
  },
  {
    url: 'https://example.com/?renderer=phaser&phaser_preview_redirect=off',
    usePhaser: false
  },
  {
    url: 'https://example.com/phaser/?renderer=phaser',
    usePhaser: true
  },
  {
    url: 'https://example.com/store?renderer=phaser',
    usePhaser: true
  },
  {
    url: 'https://example.com/?renderer=canvas',
    usePhaser: false
  }
];

for (const testCase of cases) {
  const shouldUsePhaser = shouldUsePhaserRendererFromUrl(testCase.url);
  if (shouldUsePhaser !== testCase.usePhaser) {
    throw new Error(`Routing assertion failed for ${testCase.url}: expected usePhaser=${testCase.usePhaser}, got ${shouldUsePhaser}`);
  }
}

const buildUrlCase = 'https://example.com/index.html?renderer=phaser#debug';
const built = buildPhaserPreviewUrl(buildUrlCase).toString();
if (built !== 'https://example.com/phaser/?renderer=phaser#debug') {
  throw new Error(`Target URL mismatch for ${buildUrlCase}: got ${built}`);
}

console.log(`✅ Phaser preview routing check passed (${cases.length} scenarios).`);
