import { test } from 'node:test';
import assert from 'node:assert/strict';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
let importCounter = 0;

async function loadModule() {
  importCounter += 1;
  return import(`../js/runtime-sdk-loader.js?case=${importCounter}`);
}

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobals() {
  if (originalWindow === undefined) delete globalThis.window;
  else setGlobal('window', originalWindow);

  if (originalDocument === undefined) delete globalThis.document;
  else setGlobal('document', originalDocument);

  if (originalNavigator === undefined) delete globalThis.navigator;
  else setGlobal('navigator', originalNavigator);
}

function createDocumentStub() {
  const scripts = [];
  return {
    scripts,
    querySelectorAll(selector) {
      return selector === 'script[src]' ? scripts : [];
    },
    createElement(tag) {
      assert.equal(tag, 'script');
      const dataset = {};
      return {
        dataset,
        defer: false,
        _src: '',
        set src(value) { this._src = value; },
        get src() { return this._src; },
      };
    },
    head: {
      append(script) {
        scripts.push(script);
      },
    },
  };
}

test('runtime SDK loader skips web runtime', async () => {
  const documentStub = createDocumentStub();
  setGlobal('window', { location: { search: '', hash: '' } });
  setGlobal('navigator', { userAgent: 'Mozilla/5.0' });
  setGlobal('document', documentStub);

  const { loadRuntimeSdk } = await loadModule();
  assert.equal(loadRuntimeSdk(), null);
  assert.equal(documentStub.scripts.length, 0);
  restoreGlobals();
});

test('runtime SDK loader appends once for Telegram runtime', async () => {
  const documentStub = createDocumentStub();
  setGlobal('window', {
    location: { search: '?tgWebAppData=1', hash: '' },
    Telegram: { WebApp: { initData: '' } },
  });
  setGlobal('navigator', { userAgent: 'Mozilla/5.0' });
  setGlobal('document', documentStub);

  const { loadRuntimeSdk } = await loadModule();
  const first = loadRuntimeSdk();
  const second = loadRuntimeSdk();

  assert.ok(first);
  assert.equal(second, first);
  assert.equal(documentStub.scripts.length, 1);
  assert.equal(first.defer, true);
  assert.equal(first.dataset.ursassRuntimeSdk, 'true');
  restoreGlobals();
});
