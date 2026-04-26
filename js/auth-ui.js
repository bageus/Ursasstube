import { createIconAtlas, createImageIcon } from './dom-render.js';

function normalizeTelegramUsername(value) {
  return String(value || '').trim().replace(/^@+/, '');
}

function bindWalletInfoActions(infoRoot, { onLinkWallet, onLinkTelegram } = {}) {
  if (!infoRoot) return;

  const linkWalletBtn = infoRoot.querySelector('[data-action="link-wallet"]');
  if (linkWalletBtn && typeof onLinkWallet === 'function') linkWalletBtn.addEventListener('click', onLinkWallet);

  const linkTelegramBtn = infoRoot.querySelector('[data-action="link-telegram"]');
  if (linkTelegramBtn && typeof onLinkTelegram === 'function') linkTelegramBtn.addEventListener('click', onLinkTelegram);
}

function createWalletInfoRow({ iconNode, valueId, valueClass, defaultValue }) {
  const row = document.createElement('div');
  row.className = 'wallet-info-row';
  row.append(iconNode, document.createTextNode(' '));

  const value = document.createElement('span');
  value.className = valueClass;
  value.id = valueId;
  value.textContent = defaultValue;
  row.append(value);
  return row;
}

function renderWalletStats(infoRoot) {
  infoRoot.append(
    createWalletInfoRow({
      iconNode: createIconAtlas({
        width: 16,
        height: 16,
        backgroundSize: '80px auto',
        backgroundPosition: '-16px 0px'
      }),
      valueId: 'walletRank',
      valueClass: 'val',
      defaultValue: '—'
    }),
    createWalletInfoRow({
      iconNode: createIconAtlas({
        width: 16,
        height: 16,
        backgroundSize: '80px auto',
        backgroundPosition: '-64px -16px'
      }),
      valueId: 'walletBest',
      valueClass: 'val',
      defaultValue: '0'
    }),
    createWalletInfoRow({
      iconNode: createImageIcon({ src: 'img/icon_gold.png' }),
      valueId: 'walletGold',
      valueClass: 'val-gold',
      defaultValue: '0'
    }),
    createWalletInfoRow({
      iconNode: createImageIcon({ src: 'img/icon_silver.png' }),
      valueId: 'walletSilver',
      valueClass: 'val-silver',
      defaultValue: '0'
    })
  );
}

function renderWalletInfoHeader(infoRoot, { compactLabel = null, actionLabel = null, actionName = null }) {
  if (compactLabel) {
    const row = document.createElement('div');
    row.className = 'wallet-info-row wallet-info-row-compact';
    row.textContent = compactLabel;
    infoRoot.append(row);
    return;
  }

  if (actionLabel && actionName) {
    const row = document.createElement('div');
    row.className = 'wallet-info-row';
    const btn = document.createElement('button');
    btn.className = 'link-btn';
    btn.dataset.action = actionName;
    btn.textContent = actionLabel;
    row.append(btn);
    infoRoot.append(row);
  }
}

function renderAuthUiState({
  dom,
  session,
  onConnectWallet,
  onDisconnectAuth,
  onLinkWallet,
  onLinkTelegram
}) {
  const btn = dom.walletBtn;
  const info = dom.walletInfo;

  if (session.isTelegramAuthMode) {
    const telegramUsername = normalizeTelegramUsername(session.telegramUser?.username);
    if (session.linkedWallet) {
      const walletShort = `${session.linkedWallet.slice(0, 6)}...${session.linkedWallet.slice(-4)}`;
      btn.textContent = walletShort;
    } else {
      btn.textContent = telegramUsername ? `@${telegramUsername}` : 'Player';
    }
    btn.classList.add('connected');
    btn.classList.add('wallet-btn-readonly');
    btn.onclick = null;
    info.classList.add('visible');

    info.textContent = '';
    if (session.linkedWallet) {
      const walletShort = `${session.linkedWallet.slice(0, 6)}...${session.linkedWallet.slice(-4)}`;
      renderWalletInfoHeader(info, { compactLabel: walletShort });
    } else {
      renderWalletInfoHeader(info, { actionLabel: 'Link Wallet', actionName: 'link-wallet' });
    }
    renderWalletStats(info);
    bindWalletInfoActions(info, { onLinkWallet, onLinkTelegram });
    if (dom.storeBtn) dom.storeBtn.classList.remove('menu-hidden');
    return;
  }

  if (session.isWalletAuthMode) {
    const addr = session.primaryId;
    btn.textContent = addr.startsWith('0x') ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
    btn.classList.add('connected');
    btn.classList.remove('wallet-btn-readonly');
    btn.onclick = onDisconnectAuth;
    info.classList.add('visible');

    info.textContent = '';
    renderWalletStats(info);
    bindWalletInfoActions(info, { onLinkWallet, onLinkTelegram });
    if (dom.storeBtn) dom.storeBtn.classList.remove('menu-hidden');
    return;
  }

  btn.textContent = 'Connect Wallet';
  btn.classList.remove('connected');
  btn.classList.remove('wallet-btn-readonly');
  btn.onclick = onConnectWallet;
  info.classList.remove('visible');
  info.textContent = '';
  if (dom.storeBtn) dom.storeBtn.classList.add('menu-hidden');
}

export {
  renderAuthUiState,
};
