import test from 'node:test';
import assert from 'node:assert/strict';

function mockDom() {
  const previousDocument = globalThis.document;
  const bodyClasses = new Set();
  globalThis.document = {
    body: {
      classList: {
        add: (...items) => items.forEach((i) => bodyClasses.add(i)),
        remove: (...items) => items.forEach((i) => bodyClasses.delete(i)),
        contains: (item) => bodyClasses.has(item)
      }
    }
  };
  return () => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
}

test('initAuthFlow in Telegram mode calls authenticateTelegram without existing sessionToken', async () => {
  const restoreDocument = mockDom();
  const { initAuthFlow } = await import(`../js/auth-lifecycle.js?case=${Date.now()}`);
  const calls = [];
  const authState = { sessionToken: null, telegramUser: null };
  let uiUpdates = 0;

  await initAuthFlow({
    isTelegramMiniApp: () => true,
    waitForTelegramMiniApp: async () => false,
    getTelegramUserData: () => ({ id: '1', firstName: 'T', username: 'tg', loginIdentifier: 'tg' }),
    getTelegramInitData: () => 'query=1',
    authenticateTelegram: async (payload) => {
      calls.push(payload);
      return { ok: true, data: { success: true, primaryId: 'tg:1', sessionToken: 's1' } };
    },
    clearRuntimeConfig: () => {},
    applyAuthSession: (next) => Object.assign(authState, { authMode: next.nextAuthMode, primaryId: next.nextPrimaryId, sessionToken: next.nextSessionToken }),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    updateAuthUI: () => { uiUpdates += 1; },
    runPostAuthSync: async () => {},
    clearAuthSessionState: () => { throw new Error('should not clear in telegram mode'); },
    authState,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].telegramInitData, 'query=1');
  assert.equal(authState.authMode, 'telegram');
  assert.equal(authState.sessionToken, 's1');
  assert.equal(uiUpdates, 1);
  restoreDocument();
});

test('telegram auth success without sessionToken still authenticates and logs warning', async () => {
  const restoreDocument = mockDom();
  const { initAuthFlow } = await import(`../js/auth-lifecycle.js?case=${Date.now() + 1}`);
  const authState = { sessionToken: null, telegramUser: null };
  let warned = false;

  await initAuthFlow({
    isTelegramMiniApp: () => true,
    waitForTelegramMiniApp: async () => true,
    getTelegramUserData: () => ({ id: '1', firstName: 'T', username: 'tg', loginIdentifier: 'tg' }),
    getTelegramInitData: () => 'query=1',
    authenticateTelegram: async () => ({ ok: true, data: { success: true, primaryId: 'tg:1' } }),
    clearRuntimeConfig: () => {},
    applyAuthSession: (next) => Object.assign(authState, { authMode: next.nextAuthMode, primaryId: next.nextPrimaryId, sessionToken: next.nextSessionToken }),
    logger: { info: () => {}, warn: (msg) => { if (String(msg).includes('without session token')) warned = true; }, error: () => {} },
    updateAuthUI: () => {},
    runPostAuthSync: async () => {},
    clearAuthSessionState: () => {},
    authState,
  });

  assert.equal(authState.authMode, 'telegram');
  assert.equal(authState.primaryId, 'tg:1');
  assert.equal(authState.sessionToken, null);
  assert.equal(warned, true);
  restoreDocument();
});

test('initAuthFlow waits for required gameplay sync before marking Telegram auth ready', async () => {
  const restoreDocument = mockDom();
  const { initAuthFlow } = await import(`../js/auth-lifecycle.js?case=${Date.now() + 2}`);
  const authState = { sessionToken: null, telegramUser: null };
  let releaseSync;
  let syncOptions = null;
  const syncBlocker = new Promise((resolve) => { releaseSync = resolve; });

  const previousWindow = globalThis.window;
  globalThis.window = { __ursasTelegramWalletCornerScrollBound: false };

  const initPromise = initAuthFlow({
    isTelegramMiniApp: () => true,
    waitForTelegramMiniApp: async () => true,
    getTelegramUserData: () => ({ id: '1', firstName: 'T', username: 'tg', loginIdentifier: 'tg' }),
    getTelegramInitData: () => 'query=1',
    authenticateTelegram: async () => ({ ok: true, data: { success: true, primaryId: 'tg:1', sessionToken: 's1' } }),
    clearRuntimeConfig: () => {},
    applyAuthSession: (next) => Object.assign(authState, { authMode: next.nextAuthMode, primaryId: next.nextPrimaryId, sessionToken: next.nextSessionToken }),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    updateAuthUI: () => {},
    runPostAuthSync: async (options) => {
      syncOptions = options;
      await syncBlocker;
    },
    clearAuthSessionState: () => {},
    authState,
  });

  const pendingResult = await Promise.race([
    initPromise.then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 50))
  ]);
  assert.equal(pendingResult, 'timeout');
  assert.deepEqual(syncOptions, { withLeaderboard: false });

  releaseSync();
  await initPromise;
  assert.equal(authState.authMode, 'telegram');

  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  restoreDocument();
});