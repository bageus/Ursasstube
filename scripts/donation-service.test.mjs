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

    if (!previousNavigatorDescriptor) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', previousNavigatorDescriptor);
  };
}

test('getDonationProducts returns normalized { response, data } for non-ok API response', async () => {
  const restoreGlobals = withBrowserLikeGlobals();
  const originalFetch = globalThis.fetch;
  const { getDonationProducts } = await import('../js/donation-service.js');

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'wallet required' }), { status: 400 });

  try {
    const result = await getDonationProducts('0xabc');
    assert.equal(result.response.ok, false);
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.data, { error: 'wallet required' });
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobals();
  }
});

test('createDonationStarsPayment normalizes snake_case response fields', async () => {
  const restoreGlobals = withBrowserLikeGlobals();
  const originalFetch = globalThis.fetch;
  const { createDonationStarsPayment } = await import('../js/donation-service.js');

  globalThis.fetch = async () => new Response(JSON.stringify({
    invoice_url: 'https://pay.test/invoice',
    payment_id: 'pay_123',
    stars_amount: 75
  }), { status: 200 });

  try {
    const result = await createDonationStarsPayment({ telegramInitData: 'tg-data' });

    assert.equal(result.response.ok, true);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.invoiceUrl, 'https://pay.test/invoice');
    assert.equal(result.data.paymentId, 'pay_123');
    assert.equal(result.data.amount, 75);
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobals();
  }
});

test('createDonationPayment strips x-telegram-init-data header from request', async () => {
  const restoreGlobals = withBrowserLikeGlobals();
  const originalFetch = globalThis.fetch;
  const { createDonationPayment } = await import('../js/donation-service.js');
  let capturedHeaders = null;

  globalThis.fetch = async (_url, options = {}) => {
    capturedHeaders = options.headers || null;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    await createDonationPayment(
      { wallet: '0xabc', amount: 100 },
      { headers: { 'X-Telegram-Init-Data': 'should-not-be-sent', 'X-Wallet': '0xabc' } }
    );

    const headerKeys = Object.keys(capturedHeaders || {}).map((key) => key.toLowerCase());
    assert.equal(headerKeys.includes('x-telegram-init-data'), false);
    assert.equal(headerKeys.includes('x-wallet'), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobals();
  }
});
