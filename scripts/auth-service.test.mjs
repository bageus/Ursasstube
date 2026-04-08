import test from 'node:test';
import assert from 'node:assert/strict';

function withBrowserLikeGlobals() {
  const previousWindow = globalThis.window;
  const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  Object.defineProperty(globalThis, 'window', {
    value: { innerWidth: 1024 },
    configurable: true,
    writable: true
  });

  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-test' },
    configurable: true
  });

  return () => {
    if (previousWindow === undefined) delete globalThis.window;
    else {
      Object.defineProperty(globalThis, 'window', {
        value: previousWindow,
        configurable: true,
        writable: true
      });
    }

    if (!previousNavigatorDescriptor) {
      delete globalThis.navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', previousNavigatorDescriptor);
    }
  };
}

test('authenticateWallet returns parsed data for successful response', async () => {
  const restoreGlobals = withBrowserLikeGlobals();
  const originalFetch = globalThis.fetch;
  const { authenticateWallet } = await import('../js/auth-service.js');

  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: true, primaryId: '0xabc' }),
    { status: 200 }
  );

  try {
    const data = await authenticateWallet({
      wallet: '0xabc',
      signature: 'sig',
      timestamp: 123
    });

    assert.deepEqual(data, { success: true, primaryId: '0xabc' });
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobals();
  }
});

test('authenticateTelegram preserves non-ok response as { ok, status, data } contract', async () => {
  const restoreGlobals = withBrowserLikeGlobals();
  const originalFetch = globalThis.fetch;
  const { authenticateTelegram } = await import('../js/auth-service.js');

  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: false, error: 'invalid payload' }),
    { status: 400 }
  );

  try {
    const result = await authenticateTelegram({
      telegramId: 42,
      firstName: 'Test',
      username: 'tester'
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.deepEqual(result.data, { success: false, error: 'invalid payload' });
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobals();
  }
});

test('requestTelegramLinkCode and linkWalletToTelegram surface invalid JSON as RequestError', async () => {
  const restoreGlobals = withBrowserLikeGlobals();
  const originalFetch = globalThis.fetch;
  const { requestTelegramLinkCode, linkWalletToTelegram } = await import('../js/auth-service.js');
  let call = 0;

  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) return new Response('not-json', { status: 200 });
    return new Response('invalid', { status: 200 });
  };

  try {
    await assert.rejects(
      () => requestTelegramLinkCode({ primaryId: 'uid-1' }),
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_INVALID_JSON');
        return true;
      }
    );

    await assert.rejects(
      () => linkWalletToTelegram({ primaryId: 'uid-1', wallet: '0xabc', signature: 'sig', timestamp: 123 }),
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_INVALID_JSON');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobals();
  }
});
