function initTelegramWalletCornerScrollBehavior() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__ursasTelegramWalletCornerScrollBound) return;

  const body = document.body;
  if (!body || !body.classList.contains('is-telegram')) return;

  const HIDE_SCROLL_THRESHOLD = 180;
  const SHOW_SCROLL_THRESHOLD = 72;
  let lastKnownScrollY = 0;

  const getActiveScrollTop = (eventTarget) => {
    const globalScrollTop = Math.max(
      window.scrollY || 0,
      document.documentElement?.scrollTop || 0,
      document.body?.scrollTop || 0,
    );

    const targetScrollTop = Number(eventTarget?.scrollTop || 0);
    return Math.max(globalScrollTop, targetScrollTop);
  };

  const syncWalletCornerVisibility = (currentScrollTop) => {
    const isScrollingDown = currentScrollTop > lastKnownScrollY;
    if (currentScrollTop <= SHOW_SCROLL_THRESHOLD) {
      body.classList.remove('is-telegram-wallet-corner-hidden-by-scroll');
    } else if (currentScrollTop >= HIDE_SCROLL_THRESHOLD && isScrollingDown) {
      body.classList.add('is-telegram-wallet-corner-hidden-by-scroll');
    } else if (!isScrollingDown) {
      body.classList.remove('is-telegram-wallet-corner-hidden-by-scroll');
    }
    lastKnownScrollY = currentScrollTop;
  };

  const handleScroll = (event) => {
    syncWalletCornerVisibility(getActiveScrollTop(event?.target));
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
  syncWalletCornerVisibility(getActiveScrollTop());
  window.__ursasTelegramWalletCornerScrollBound = true;
}

async function initAuthFlow({
  isTelegramMiniApp,
  waitForTelegramMiniApp,
  getTelegramUserData,
  getTelegramInitData,
  authenticateTelegram,
  clearRuntimeConfig,
  applyAuthSession,
  logger,
  updateAuthUI,
  runPostAuthSync,
  clearAuthSessionState,
  authState,
}) {
  const isTelegramReady = isTelegramMiniApp() || await waitForTelegramMiniApp();
  if (isTelegramReady) {
    document.body.classList.add('telegram-mini-app');
    document.body.classList.add('is-telegram');
    document.body.classList.remove('is-web');
    initTelegramWalletCornerScrollBehavior();
    authState.telegramUser = getTelegramUserData();
    const telegramInitData = getTelegramInitData();
    const telegramIdentifier = String(
      authState.telegramUser?.loginIdentifier
      || authState.telegramUser?.username
      || authState.telegramUser?.id
      || ''
    ).trim();
    logger.info('📱 Telegram mode:', authState.telegramUser);

    try {
      const { ok, data } = await authenticateTelegram({
        telegramId: authState.telegramUser.id,
        firstName: authState.telegramUser.firstName,
        username: authState.telegramUser.username,
        telegramInitData,
      });

      if (ok && data.success) {
        clearRuntimeConfig();
        applyAuthSession({
          nextAuthMode: 'telegram',
          nextPrimaryId: data.primaryId || telegramIdentifier,
          nextTelegramUser: authState.telegramUser,
          nextLinkedWallet: data.wallet,
          nextIsWalletConnected: true,
          nextUserWallet: String(data.primaryId || telegramIdentifier || '').trim() || null,
        });
        logger.info('✅ Telegram auth OK:', authState.primaryId);
        updateAuthUI();
        await runPostAuthSync();
      }
    } catch (error) {
      logger.error('❌ Telegram auth error:', error);
    }

    return;
  }

  document.body.classList.remove('telegram-mini-app');
  document.body.classList.remove('is-telegram');
  document.body.classList.add('is-web');
  clearAuthSessionState();
  logger.info('🌐 Browser mode — wallet auth');
  updateAuthUI();
}

function disconnectAuthFlow({ WC, clearAuthSessionState, DOM, notifyAuthDisconnected, updateAuthUI, logger }) {
  WC.disconnect();
  clearAuthSessionState();
  DOM.walletBtn.textContent = 'Connect Wallet';
  DOM.walletBtn.classList.remove('connected');
  DOM.walletInfo.classList.remove('visible');
  if (DOM.storeBtn) DOM.storeBtn.classList.add('menu-hidden');

  notifyAuthDisconnected();

  updateAuthUI();
  logger.info('🔌 Disconnected');
}

export {
  initAuthFlow,
  disconnectAuthFlow,
};
