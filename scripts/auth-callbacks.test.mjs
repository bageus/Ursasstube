import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.id = '';
    this.className = '';
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.onclick = null;
    this.children = [];
    this.classList = createClassList();
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    if (this._textContent === '') this.children = [];
  }

  get textContent() {
    return this._textContent;
  }

  append(...children) {
    this.children.push(...children.filter(Boolean));
  }

  addEventListener() {}

  querySelector(selector) {
    const matches = (node) => {
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      const actionMatch = selector.match(/^\[data-action="([^"]+)"\]$/);
      return actionMatch ? node.dataset?.action === actionMatch[1] : false;
    };
    const visit = (nodes) => {
      for (const node of nodes) {
        if (matches(node)) return node;
        const nested = visit(node.children || []);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this.children);
  }
}

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

test('wallet auth immediately shows profile and rebinds rendered balance nodes', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = {};
  globalThis.document = {
    createElement: (tagName) => new FakeNode(tagName),
    createTextNode: (value) => ({ textContent: String(value), children: [] })
  };

  try {
    const { renderAuthUiState } = await import(`../js/auth-ui.js?main-screen=${Date.now()}`);
    const walletBtn = new FakeNode('button');
    const walletInfo = new FakeNode('div');
    const playerAvatarBtn = new FakeNode('button');
    playerAvatarBtn.hidden = true;
    const storeBtn = new FakeNode('button');
    storeBtn.classList.add('menu-hidden');
    const tgAccountBadge = new FakeNode('span');
    const detachedGold = new FakeNode('span');
    const detachedSilver = new FakeNode('span');
    const dom = {
      walletBtn,
      walletInfo,
      playerAvatarBtn,
      storeBtn,
      tgAccountBadge,
      walletGold: detachedGold,
      walletSilver: detachedSilver
    };

    renderAuthUiState({
      dom,
      session: {
        isTelegramAuthMode: false,
        isWalletAuthMode: true,
        primaryId: '0x1234567890abcdef',
        linkedWallet: null
      },
      onConnectWallet() {},
      onDisconnectAuth() {},
      onLinkWallet() {},
      onLinkTelegram() {}
    });

    assert.equal(playerAvatarBtn.hidden, false);
    assert.equal(storeBtn.classList.contains('menu-hidden'), false);
    assert.equal(dom.walletGold.id, 'walletGold');
    assert.equal(dom.walletSilver.id, 'walletSilver');
    assert.notEqual(dom.walletGold, detachedGold);
    assert.notEqual(dom.walletSilver, detachedSilver);

    renderAuthUiState({
      dom,
      session: {
        isTelegramAuthMode: false,
        isWalletAuthMode: false,
        primaryId: null,
        linkedWallet: null
      },
      onConnectWallet() {},
      onDisconnectAuth() {},
      onLinkWallet() {},
      onLinkTelegram() {}
    });

    assert.equal(playerAvatarBtn.hidden, true);
    assert.equal(storeBtn.classList.contains('menu-hidden'), true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('desktop web menu collapses hidden Store and rides slots', () => {
  const css = readFileSync(new URL('../css/menu-layout.css', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart \.btn-new\.menu-hidden,[\s\S]*display: none;/);
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart #ridesInfo:not\(\.visible\)/);
  assert.match(css, /#gameStart \.start-btn-wrap \{ order: 2;/);
  assert.match(css, /#gameStart #storeBtn \{ order: 3;/);
});

test('restored and Telegram auth wait for gameplay upgrades before app-ready', () => {
  const source = readFileSync(new URL('../js/auth-lifecycle.js', import.meta.url), 'utf8');
  assert.match(source, /await runPostAuthSync\(\{ withLeaderboard: false \}\)/);

  const telegramSyncIndex = source.indexOf("context: 'telegram-initial'");
  const telegramReadyIndex = source.indexOf('markAuthReady();', telegramSyncIndex);
  assert.ok(telegramSyncIndex >= 0, 'Telegram required sync must exist');
  assert.ok(telegramReadyIndex > telegramSyncIndex, 'Telegram auth-ready must follow required gameplay sync');

  const browserSyncIndex = source.indexOf("context: 'browser-restored'");
  const browserReadyIndex = source.indexOf('markAuthReady();', browserSyncIndex);
  assert.ok(browserSyncIndex >= 0, 'restored browser required sync must exist');
  assert.ok(browserReadyIndex > browserSyncIndex, 'restored browser auth-ready must follow required gameplay sync');
});