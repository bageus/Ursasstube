import { test } from 'node:test';
import assert from 'node:assert/strict';

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
let importCounter = 0;

async function loadHelper() {
  importCounter += 1;
  return import(`../js/runtime-detection.js?case=${importCounter}`);
}

function setWindow(value) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  });
}

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobals() {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    setWindow(originalWindow);
  }

  if (originalNavigator === undefined) {
    delete globalThis.navigator;
  } else {
    setNavigator(originalNavigator);
  }
}

test('runtime helper is false without browser globals', async () => {
  delete globalThis.window;
  delete globalThis.navigator;
  const { isTelegramRuntime } = await loadHelper();
  assert.equal(isTelegramRuntime(), false);
  restoreGlobals();
});

test('runtime helper detects initData', async () => {
  setWindow({
    location: { search: '', hash: '' },
    Telegram: { WebApp: { initData: 'user=1' } },
  });
  setNavigator({ userAgent: 'Mozilla/5.0' });
  const { isTelegramRuntime } = await loadHelper();
  assert.equal(isTelegramRuntime(), true);
  restoreGlobals();
});

test('runtime helper detects launch params', async () => {
  setWindow({
    location: { search: '?tgWebAppData=query-data', hash: '' },
    Telegram: { WebApp: { initData: '' } },
  });
  setNavigator({ userAgent: 'Mozilla/5.0' });
  const { isTelegramRuntime } = await loadHelper();
  assert.equal(isTelegramRuntime(), true);
  restoreGlobals();
});
