import { test } from 'node:test';
import assert from 'node:assert/strict';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
let importCounter = 0;

async function loadModule() {
  importCounter += 1;
  return import(`../js/runtime-sdk-loader.js?existing=${importCounter}`);
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
  let appendCalls = 0;
  return {
    scripts,
    get appendCalls() { return appendCalls; },
    querySelectorAll(selector) {
      return selector === 'script[src]' ? scripts : [];
    },
    createElement() {
      throw new Error('should reuse existing script');
    },
    head: {
      append() {
        appendCalls += 1;
      },
    },
  };
}

test('runtime SDK loader reuses existing script tag', async () => {
  const documentStub = createDocumentStub();
  setGlobal('window', {
    location: { search: '?tgWebAppData=1', hash: '' },
    Telegram: { WebApp: { initData: '' } },
  });
  setGlobal('navigator', { userAgent: 'Mozilla/5.0' });
  setGlobal('document', documentStub);

  const { SDK_SRC, loadRuntimeSdk } = await loadModule();
  const existingScript = { src: SDK_SRC, dataset: {}, defer: true };
  documentStub.scripts.push(existingScript);

  const result = loadRuntimeSdk();

  assert.equal(result, existingScript);
  assert.equal(documentStub.scripts.length, 1);
  assert.equal(documentStub.appendCalls, 0);
  restoreGlobals();
});
