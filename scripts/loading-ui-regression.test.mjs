import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const cssPath = new URL('../css/style.css', import.meta.url);
const htmlPath = new URL('../index.html', import.meta.url);

test('loading-ui keeps start shell visible and hides only buttons', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /body\.loading-ui\s+#gameStart[\s\S]*opacity:\s*1/i);
  assert.match(css, /body\.loading-ui\s+\.new-title[\s\S]*visibility:\s*visible/i);
  assert.match(css, /body\.loading-ui\s+#startLeaderboardWrap[\s\S]*visibility:\s*visible/i);
  assert.match(css, /body\.loading-ui\s+\.lb[\s\S]*visibility:\s*visible/i);
  assert.match(css, /body\.loading-ui\s+#appLoadingStatus[\s\S]*display:\s*flex/i);
  assert.match(css, /body\.loading-ui\s+\.new-buttons[\s\S]*visibility:\s*hidden/i);
});

test('loading bar is not inside interactive buttons block', async () => {
  const html = await fs.readFile(htmlPath, 'utf8');
  const loadingIndex = html.indexOf('<div id="appLoadingStatus"');
  const buttonsIndex = html.indexOf('<div class="new-buttons">');
  assert.notEqual(loadingIndex, -1);
  assert.notEqual(buttonsIndex, -1);
  assert.ok(loadingIndex < buttonsIndex, 'loading status should be before .new-buttons');
});
