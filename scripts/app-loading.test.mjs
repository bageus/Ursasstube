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
  const timeouts = new Map();
  let timeoutId = 0;
  const setTimeoutMock = (fn, ms) => {
    const id = ++timeoutId;
    timeouts.set(id, { fn, ms });
    return id;
  };
  const clearTimeoutMock = (id) => {
    timeouts.delete(id);
  };
  globalThis.window = {
    setInterval,
    clearInterval,
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
  };
  const runTimeout = (ms) => {
    for (const [id, timer] of [...timeouts.entries()]) {
      if (timer.ms === ms) {
        timeouts.delete(id);
        timer.fn();
      }
    }
  };
  return { classes, fill, text, runTimeout, restore: () => { if (previousDocument===undefined) delete globalThis.document; else globalThis.document = previousDocument; if (previousWindow===undefined) delete globalThis.window; else globalThis.window = previousWindow; } };
}

test('progress does not exceed 80 before readiness', async () => {
  const env = mockRuntime();
  const mod = await import(`../js/app-loading.js?t=${Date.now()}`);
  mod.initAppLoading();
  await new Promise((r) => setTimeout(r, 1200));
  const width = Number(env.fill.style.width.replace('%', ''));
  assert.ok(width <= 80);
  mod.markAppReady();
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

test('app-ready depends on shell + auth + game runtime', async () => {
  const env = mockRuntime();
  const mod = await import(`../js/app-loading.js?t=${Date.now()+2}`);
  mod.initAppLoading();
  mod.markAuthReady();
  mod.markGameRuntimeReady();
  assert.equal(env.classes.has('app-ready'), false);
  mod.markAppShellReady();
  assert.equal(env.classes.has('app-ready'), true);
  mod.markAppReady();
  env.restore();
});

test('non-critical fail-open finalizes when critical readiness is complete', async () => {
  const env = mockRuntime();
  const mod = await import(`../js/app-loading.js?t=${Date.now()+3}`);
  mod.initAppLoading();
  mod.markAppShellReady();
  mod.markAuthReady();
  assert.equal(env.classes.has('app-ready'), false);
  env.runTimeout(7000);
  assert.equal(env.classes.has('app-ready'), true);
  env.restore();
});
