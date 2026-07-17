import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const htmlPath = new URL('../index.html', import.meta.url);
const cssPath = new URL('../css/style.css', import.meta.url);
const webMenuCssPath = new URL('../public/css/web-menu-layout.css', import.meta.url);
const overlayNavigationCssPath = new URL('../css/overlay-navigation.css', import.meta.url);
const mainPath = new URL('../js/main.js', import.meta.url);
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

test('desktop web player menu starts at the scroll origin and keeps Back visible', async () => {
  const css = await fs.readFile(webMenuCssPath, 'utf8');
  assert.match(css, /#playerMenuOverlay\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*\}/i);
  assert.match(css, /#playerMenuOverlay\.visible,[\s\S]*#playerMenuOverlay:not\(\[hidden\]\)\s*\{\s*display:\s*block;/i);
  assert.match(css, /#playerMenuOverlay\s+\.pm-back-btn\s*\{[\s\S]*position:\s*fixed;[\s\S]*top:[\s\S]*left:[\s\S]*z-index:\s*151;/i);
  assert.doesNotMatch(css, /place-items:\s*center/i);
});

test('player menu Back uses the same final visual contract as other overlay Back buttons', async () => {
  const css = await fs.readFile(overlayNavigationCssPath, 'utf8');
  const main = await fs.readFile(mainPath, 'utf8');
  assert.match(css, /\.store-nav-btn\.app-back-btn,\s*\.player-menu-overlay \.pm-back-btn\s*\{/i);
  assert.match(css, /width:\s*44px;[\s\S]*height:\s*44px;[\s\S]*border:\s*1px solid rgba\(255, 255, 255, \.18\);[\s\S]*background:\s*rgba\(255, 255, 255, \.05\);/i);
  assert.match(css, /\.store-nav-btn\.app-back-btn:hover,\s*\.player-menu-overlay \.pm-back-btn:hover/i);
  assert.ok(main.indexOf("import '../css/overlay-navigation.css';") > main.indexOf("import '../css/style.css';"));
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


test('controller coin history filters spending and purchase-like entries', async () => {
  const src = await fs.readFile(controllerPath, 'utf8');
  assert.match(src, /const rows = \(Array\.isArray\(history\) \? history : \[\]\)\.filter\(isIncomeHistoryEntry\);/);
  assert.match(src, /'buy'/);
  assert.match(src, /'store_purchase'/);
  assert.match(src, /'purchase'/);
  assert.match(src, /'donation_payment'/);
  assert.match(src, /function isIncomeHistoryEntry\(entry\)/);
  assert.match(src, /\['spending', 'spend', 'debit', 'out', 'outgoing', 'withdrawal', 'purchase', 'buy'\]/);
  assert.match(src, /buy\|purchase\|spend\|spent\|cost\|payment\|debit\|consume/);
  assert.match(src, /rawGoldDelta >= 0 && rawSilverDelta >= 0/);
  assert.match(src, /COIN_HISTORY_TYPE_LABELS\[typeKey\] \|\| typeKey \|\| 'Reward'/);
});