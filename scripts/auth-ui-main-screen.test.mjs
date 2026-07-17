import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const previousWindow = globalThis.window;
globalThis.window = {};
const {
  syncPlayerAvatarVisibility,
  syncWalletStatDomNodes
} = await import(`../js/auth-ui.js?t=${Date.now()}`);

function restoreWindow() {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

test('player avatar is shown immediately for wallet auth', () => {
  const playerAvatarBtn = { hidden: true };
  syncPlayerAvatarVisibility({ playerAvatarBtn }, {
    isWalletAuthMode: true,
    linkedWallet: null
  });
  assert.equal(playerAvatarBtn.hidden, false);
});

test('player avatar follows linked-wallet and unauthenticated state', () => {
  const playerAvatarBtn = { hidden: true };
  syncPlayerAvatarVisibility({ playerAvatarBtn }, {
    isWalletAuthMode: false,
    linkedWallet: '0xabc'
  });
  assert.equal(playerAvatarBtn.hidden, false);

  syncPlayerAvatarVisibility({ playerAvatarBtn }, {
    isWalletAuthMode: false,
    linkedWallet: null
  });
  assert.equal(playerAvatarBtn.hidden, true);
});

test('wallet balance DOM cache is rebound after auth UI rerender', () => {
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
});

test('desktop web menu collapses hidden Store and rides slots', () => {
  const css = readFileSync(new URL('../css/menu-layout.css', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart \.btn-new\.menu-hidden,[\s\S]*display: none;/);
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart #ridesInfo:not\(\.visible\)/);
  assert.match(css, /#gameStart \.start-btn-wrap \{ order: 2;/);
  assert.match(css, /#gameStart #storeBtn \{ order: 3;/);
});

test.after(restoreWindow);
