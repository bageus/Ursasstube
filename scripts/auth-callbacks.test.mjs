import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('runPostAuthSync swallows leaderboard failures and completes', async () => {
  const mod = await import(`../js/auth-callbacks.js?t=${Date.now()}`);
  let ridesUpdated = false;
  let authNotified = false;

  mod.setAuthCallbacks({
    onWalletUiUpdate: async () => {},
    onLoadPlayerUpgrades: async () => {},
    onLoadLeaderboard: async () => { throw new Error('timeout'); },
    onUpdateRidesDisplay: () => { ridesUpdated = true; },
    onAuthAuthenticated: () => { authNotified = true; }
  });

  await assert.doesNotReject(() => mod.runPostAuthSync());
  assert.equal(ridesUpdated, true);
  assert.equal(authNotified, true);
});

test('player avatar follows wallet-auth state without waiting for profile fetch', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const { syncPlayerAvatarVisibility } = await import(`../js/auth-ui.js?avatar=${Date.now()}`);
    const playerAvatarBtn = { hidden: true };

    syncPlayerAvatarVisibility({ playerAvatarBtn }, {
      isWalletAuthMode: true,
      linkedWallet: null
    });
    assert.equal(playerAvatarBtn.hidden, false);

    syncPlayerAvatarVisibility({ playerAvatarBtn }, {
      isWalletAuthMode: false,
      linkedWallet: null
    });
    assert.equal(playerAvatarBtn.hidden, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('wallet balance DOM cache is rebound after auth UI rerender', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const { syncWalletStatDomNodes } = await import(`../js/auth-ui.js?balance=${Date.now()}`);
    const gold = { id: 'walletGold' };
    const silver = { id: 'walletSilver' };
    const dom = {
      walletGold: { id: 'detachedGold' },
      walletSilver: { id: 'detachedSilver' }
    };
    const infoRoot = {
      querySelector(selector) {
        if (selector === '#walletGold') return gold;
        if (selector === '#walletSilver') return silver;
        return null;
      }
    };

    syncWalletStatDomNodes(dom, infoRoot);
    assert.equal(dom.walletGold, gold);
    assert.equal(dom.walletSilver, silver);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('desktop web menu collapses hidden Store and rides slots', () => {
  const css = readFileSync(new URL('../css/menu-layout.css', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart \.btn-new\.menu-hidden,[\s\S]*display: none;/);
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart #ridesInfo:not\(\.visible\)/);
  assert.match(css, /#gameStart \.start-btn-wrap \{ order: 2;/);
  assert.match(css, /#gameStart #storeBtn \{ order: 3;/);
});
