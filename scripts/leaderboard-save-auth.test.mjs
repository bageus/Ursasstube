import test from 'node:test';
import assert from 'node:assert/strict';

function mockBrowser({ initData = '', telegram = true } = {}) {
  const previousWindow = globalThis.window;
  const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const store = new Map();
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
  const baseWindow = { localStorage, innerWidth: 390 };
  if (telegram) {
    baseWindow.Telegram = { WebApp: { initData } };
  }
  Object.defineProperty(globalThis, 'window', { value: baseWindow, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Telegram iOS' }, configurable: true });
  return {
    restore() {
      if (previousWindow === undefined) delete globalThis.window;
      else Object.defineProperty(globalThis, 'window', { value: previousWindow, configurable: true, writable: true });
      if (!previousNavigatorDescriptor) delete globalThis.navigator;
      else Object.defineProperty(globalThis, 'navigator', previousNavigatorDescriptor);
    }
  };
}

async function setupModules(caseId) {
  const auth = await import(`../js/auth-state.js?case=${caseId}`);
  const state = await import(`../js/state.js?case=${caseId}`);
  const api = await import(`../js/api.js?case=${caseId}`);
  state.gameState.score = 15;
  state.gameState.distance = 200;
  state.gameState.goldCoins = 3;
  state.gameState.silverCoins = 5;
  return { auth, api };
}

test('telegram save sends Bearer and Telegram initData', async () => {
  const env = mockBrowser({ initData: 'query_id=abc&hash=xyz' });
  const caseId = Date.now();
  const { auth, api } = await setupModules(caseId);
  auth.applyAuthSession({
    nextAuthMode: 'telegram',
    nextPrimaryId: 'tg:123',
    nextTelegramUser: { id: 123 },
    nextSessionToken: 'session-123'
  });

  const originalFetch = globalThis.fetch;
  let headers;
  globalThis.fetch = async (_url, options = {}) => {
    headers = options.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await api.saveResultToLeaderboard({ runToken: 't-1' });
  assert.equal(result.status, 'saved');
  assert.equal(headers.Authorization, 'Bearer session-123');
  assert.equal(headers['X-Telegram-Init-Data'], 'query_id=abc&hash=xyz');

  globalThis.fetch = originalFetch;
  env.restore();
});

test('telegram save fails fast when token and initData are both missing', async () => {
  const env = mockBrowser({ telegram: false });
  const caseId = Date.now() + 1;
  const { auth, api } = await setupModules(caseId);
  auth.applyAuthSession({
    nextAuthMode: 'telegram',
    nextPrimaryId: 'tg:123',
    nextTelegramUser: { id: 123 },
    nextSessionToken: null
  });

  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const result = await api.saveResultToLeaderboard({ runToken: 't-2' });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'telegram_auth_proof_missing');
  assert.equal(called, false);

  globalThis.fetch = originalFetch;
  env.restore();
});

test('telegram save maps 401 to telegram_auth_failed', async () => {
  const env = mockBrowser({ initData: 'query_id=abc&hash=xyz' });
  const caseId = Date.now() + 2;
  const { auth, api } = await setupModules(caseId);
  auth.applyAuthSession({
    nextAuthMode: 'telegram',
    nextPrimaryId: 'tg:123',
    nextTelegramUser: { id: 123 },
    nextSessionToken: null
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const result = await api.saveResultToLeaderboard({ runToken: 't-3' });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'telegram_auth_failed');

  globalThis.fetch = originalFetch;
  env.restore();
});
