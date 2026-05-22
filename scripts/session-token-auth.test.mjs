import test from 'node:test';
import assert from 'node:assert/strict';

function mockBrowser({ storageSeed = {} } = {}) {
  const previousWindow = globalThis.window;
  const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const store = new Map(Object.entries(storageSeed));
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage, innerWidth: 1024 },
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-test' }, configurable: true });
  return {
    localStorage,
    restore() {
      if (previousWindow === undefined) delete globalThis.window;
      else Object.defineProperty(globalThis, 'window', { value: previousWindow, configurable: true, writable: true });
      if (!previousNavigatorDescriptor) delete globalThis.navigator;
      else Object.defineProperty(globalThis, 'navigator', previousNavigatorDescriptor);
    }
  };
}

test('wallet auth sessionToken persists and clears on logout/reset', async () => {
  const env = mockBrowser();
  const { applyAuthSession, clearAuthSessionState, authState } = await import(`../js/auth-state.js?case=${Date.now()}`);
  applyAuthSession({ nextAuthMode: 'wallet', nextPrimaryId: '0xabc', nextSessionToken: 'token-1', nextIsWalletConnected: true });
  assert.equal(authState.sessionToken, 'token-1');
  const raw = env.localStorage.getItem('ursas.auth.session.v1');
  assert.ok(raw);
  assert.equal(JSON.parse(raw).sessionToken, 'token-1');

  clearAuthSessionState();
  assert.equal(authState.sessionToken, null);
  assert.equal(JSON.parse(env.localStorage.getItem('ursas.auth.session.v1')).sessionToken, null);
  env.restore();
});

test('private requests include Authorization Bearer and 401 marks auth expired', async () => {
  const env = mockBrowser();
  const authModule = await import(`../js/auth-state.js?case=${Date.now()}`);
  const { applyAuthSession, authState } = authModule;
  const api = await import(`../js/api.js?case=${Date.now()}`);
  applyAuthSession({ nextAuthMode: 'wallet', nextPrimaryId: '0xabc', nextSessionToken: 'token-2', nextIsWalletConnected: true });

  const originalFetch = globalThis.fetch;
  let capturedAuthorization = '';
  globalThis.fetch = async (_url, options = {}) => {
    capturedAuthorization = options?.headers?.Authorization || '';
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  };
  const result = await api.applyReferralCode('TEST');
  assert.equal(capturedAuthorization, 'Bearer token-2');
  assert.equal(result.status, 401);
  assert.equal(authState.authExpired, true);
  assert.equal(authState.sessionToken, null);
  globalThis.fetch = originalFetch;
  env.restore();
});
