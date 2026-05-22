import test from 'node:test';
import assert from 'node:assert/strict';

function mockRuntime() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const classes = new Set();
  const statusClasses = new Set();
  const fill = { style: { width: '0%' } };
  const text = { textContent: '' };
  const status = { classList: { add: (...x) => x.forEach((v) => statusClasses.add(v)) } };
  globalThis.document = {
    body: { classList: { add: (...x) => x.forEach((v) => classes.add(v)), remove: (...x) => x.forEach((v) => classes.delete(v)) } },
    getElementById: (id) => ({ appLoadingStatus: status, appLoadingBarFill: fill, appLoadingText: text }[id] || null)
  };
  globalThis.window = {
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  };
  return { classes, fill, text, restore: () => { if (previousDocument===undefined) delete globalThis.document; else globalThis.document = previousDocument; if (previousWindow===undefined) delete globalThis.window; else globalThis.window = previousWindow; } };
}

test('progress does not exceed 80 before readiness', async () => {
  const env = mockRuntime();
  const mod = await import(`../js/app-loading.js?t=${Date.now()}`);
  mod.initAppLoading();
  await new Promise((r) => setTimeout(r, 1200));
  const width = Number(env.fill.style.width.replace('%', ''));
  assert.ok(width <= 80);
  env.restore();
});

test('markAppReady sets app-ready class and reaches 100', async () => {
  const env = mockRuntime();
  const mod = await import(`../js/app-loading.js?t=${Date.now()+1}`);
  mod.initAppLoading();
  mod.markAppReady();
  assert.equal(env.classes.has('app-ready'), true);
  assert.equal(env.fill.style.width, '100%');
  env.restore();
});
