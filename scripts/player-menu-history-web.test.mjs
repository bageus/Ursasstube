import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const htmlPath = new URL('../index.html', import.meta.url);
const cssPath = new URL('../css/style.css', import.meta.url);
const controllerPath = new URL('../js/player-menu/controller.js', import.meta.url);

test('index.html includes player menu history section and body container', async () => {
  const html = await fs.readFile(htmlPath, 'utf8');
  assert.match(html, /<section\s+class="pm-history"[\s\S]*?<tbody\s+id="pmHistoryBody"/i);
});

test('history section is visible for web and telegram body classes', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /body\.is-telegram\s+#playerMenuOverlay\s+\.pm-history,[\s\S]*body\.telegram-mini-app\s+#playerMenuOverlay\s+\.pm-history,[\s\S]*body\.is-web\s+#playerMenuOverlay\s+\.pm-history\s*\{\s*display:\s*block;\s*\}/i);
});

test('web player menu content uses non-clipping layout values', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /\.pm-content\s*\{[\s\S]*flex:\s*0\s+0\s+auto;[\s\S]*min-height:\s*0;[\s\S]*\}/i);
});

test('controller ensures history template and has resilient fallback render states', async () => {
  const src = await fs.readFile(controllerPath, 'utf8');
  assert.match(src, /overlay\.querySelector\('\.pm-content'\)/);
  assert.match(src, /targetContainer\.insertAdjacentHTML\(/);
  assert.match(src, /renderCoinHistory\(\[],\s*\{\s*loading:\s*true\s*\}\)/);
  assert.match(src, /const \{ loadFailed = false, loading = false \} = options;/);
  assert.match(src, /Loading history\.\.\./);
  assert.match(src, /Could not load history/);
});
