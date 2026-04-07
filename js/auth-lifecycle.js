async function initAuthFlow({
  isTelegramMiniApp,
  getTelegramUserData,
  authenticateTelegram,
  clearRuntimeConfig,
  applyAuthSession,
  logger,
  updateAuthUI,
  runPostAuthSync,
  clearAuthSessionState,
  authState,
}) {
  if (isTelegramMiniApp()) {
    authState.telegramUser = getTelegramUserData();
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
      });

      if (ok && data.success) {
        clearRuntimeConfig();
        applyAuthSession({
          nextAuthMode: 'telegram',
          nextPrimaryId: telegramIdentifier || data.primaryId,
          nextTelegramUser: authState.telegramUser,
          nextLinkedWallet: data.wallet,
          nextIsWalletConnected: true,
          nextUserWallet: telegramIdentifier || data.primaryId,
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
