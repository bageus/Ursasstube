import test from 'node:test';
import assert from 'node:assert/strict';

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('balance cache restores instantly and remains scoped to the active account', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const storage = createStorage();
  const nodes = new Map([
    ['walletGold', { textContent: '' }],
    ['walletSilver', { textContent: '' }],
    ['storeGoldVal', { textContent: '' }],
    ['storeSilverVal', { textContent: '' }]
  ]);

  globalThis.window = { localStorage: storage };
  globalThis.document = {
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };

  try {
    const mod = await import(`../js/balance-cache.js?t=${Date.now()}`);

    assert.equal(mod.setBalanceCacheIdentity('0xABC'), null);
    assert.deepEqual(mod.updateCachedBalance({ gold: 120, silver: 45 }), { gold: 120, silver: 45 });
    assert.equal(nodes.get('walletGold').textContent, '120');
    assert.equal(nodes.get('walletSilver').textContent, '45');
    assert.ok(storage.values.has('ursass.balance.v1.0xabc'));

    window.__ursasBalanceCacheByIdentity = Object.create(null);
    mod.setBalanceCacheIdentity(null);
    assert.equal(window.__ursasLastKnownBalance, null);

    assert.deepEqual(mod.setBalanceCacheIdentity('0xabc'), { gold: 120, silver: 45 });
    assert.deepEqual(mod.getCachedBalance(), { gold: 120, silver: 45 });

    assert.equal(mod.setBalanceCacheIdentity('0xDEF'), null);
    assert.equal(mod.getCachedBalance(), null);
    assert.equal(window.__ursasLastKnownBalance, null);

    mod.updateCachedBalance({ gold: 7, silver: 3 });
    assert.deepEqual(mod.setBalanceCacheIdentity('0xabc'), { gold: 120, silver: 45 });
    assert.deepEqual(mod.setBalanceCacheIdentity('0xdef'), { gold: 7, silver: 3 });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
