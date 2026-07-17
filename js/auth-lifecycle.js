import { markAuthReady, markAuthFailed } from './app-loading.js';

function initTelegramWalletCornerScrollBehavior() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__ursasTelegramWalletCornerScrollBound) return;

  const body = document.body;
  if (!body || !body.classList.contains('is-telegram')) return;

  // Telegram main screen UX: keep wallet/player menu controls pinned at top-right.
  // No scroll-reactive hiding in mini app mode.
  body.classList.remove('is-telegram-wallet-corner-hidden-by-scroll');
  window.__ursasTelegramWalletCornerScrollBound = true;
}

async function runRequiredPostAuthSync({ runPostAuthSync, logger, context }) {
  try {
    // Wallet/profile UI and purchased gameplay effects are required before Start is unlocked.
    // Leaderboard loading stays non-blocking and is started separately by game bootstrap.
    await runPostAuthSync({ withLeaderboard: false });
    return { ok: true, error: null };
  } catch (error) {
    logger.warn(`⚠️ Required post-auth sync failed (${context})`, error);
    return { ok: false, error };
  }
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
  const isUnauthorizedError = (error) => {
    const status = Number(error?.status ?? error?.cause?.status ?? error?.response?.status);
    return status === 401;
  };

  const isTelegramReady = isTelegramMiniApp() || await waitForTelegramMiniApp();
  if (isTelegramReady) {
    document.body.classList.add('telegram-runtime');
    document.body.classList.add('telegram-mini-app');
    document.body.classList.add('is-telegram');
    document.body.classList.remove('is-web');
    initTelegramWalletCornerScrollBehavior();
    authState.telegramUser = getTelegramUserData();
    const telegramInitData = getTelegramInitData();
    if (!telegramInitData) {
      logger.warn('⚠️ Telegram initData is missing; auto-auth cannot start.');
      updateAuthUI();
      markAuthFailed('Telegram auth failed. Reopen app.');
      return;
    }
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
        const sessionToken = data.sessionToken || null;
        applyAuthSession({
          nextAuthMode: 'telegram',
          nextPrimaryId: data.primaryId || telegramIdentifier,
          nextTelegramUser: authState.telegramUser,
          nextLinkedTelegramId: data.telegramId || authState.telegramUser?.id || null,
          nextLinkedTelegramUsername: data.telegramUsername || authState.telegramUser?.username || null,
          nextLinkedWallet: data.wallet,
          nextIsWalletConnected: true,
          nextUserWallet: String(data.primaryId || telegramIdentifier || '').trim() || null,
          nextSessionToken: sessionToken,
        });
        if (!sessionToken) {
          logger.warn('⚠️ Telegram auth succeeded without session token; private API requests may return 401 until refresh.');
        }
        logger.info('✅ Telegram auth OK:', authState.primaryId);
        updateAuthUI();

        let syncResult = await runRequiredPostAuthSync({
          runPostAuthSync,
          logger,
          context: 'telegram-initial'
        });

        if (!syncResult.ok && isUnauthorizedError(syncResult.error) && telegramInitData) {
          logger.warn('⚠️ Post-auth sync returned 401; retrying Telegram auth once.');
          applyAuthSession({
            nextAuthMode: authState.authMode,
            nextPrimaryId: authState.primaryId,
            nextTelegramUser: authState.telegramUser,
            nextLinkedTelegramId: authState.linkedTelegramId,
            nextLinkedTelegramUsername: authState.linkedTelegramUsername,
            nextLinkedWallet: authState.linkedWallet,
            nextIsWalletConnected: authState.isWalletConnected,
            nextUserWallet: authState.userWallet,
            nextSessionToken: null,
            nextAuthExpired: false,
          });
          const retry = await authenticateTelegram({
            telegramId: authState.telegramUser.id,
            firstName: authState.telegramUser.firstName,
            username: authState.telegramUser.username,
            telegramInitData,
          });
          if (retry.ok && retry.data?.success) {
            applyAuthSession({
              nextAuthMode: 'telegram',
              nextPrimaryId: retry.data.primaryId || telegramIdentifier,
              nextTelegramUser: authState.telegramUser,
              nextLinkedTelegramId: retry.data.telegramId || authState.telegramUser?.id || null,
              nextLinkedTelegramUsername: retry.data.telegramUsername || authState.telegramUser?.username || null,
              nextLinkedWallet: retry.data.wallet,
              nextIsWalletConnected: true,
              nextUserWallet: String(retry.data.primaryId || telegramIdentifier || '').trim() || null,
              nextSessionToken: retry.data.sessionToken || null,
            });
            updateAuthUI();
            syncResult = await runRequiredPostAuthSync({
              runPostAuthSync,
              logger,
              context: 'telegram-retry'
            });
          }
        }

        if (!syncResult.ok) {
          logger.warn('⚠️ Gameplay upgrade sync is unavailable; continuing with the authenticated session.');
        }
        markAuthReady();
      } else {
        markAuthFailed('Telegram auth failed. Reopen app.');
      }
    } catch (error) {
      logger.error('❌ Telegram auth error:', error);
      markAuthFailed('Telegram auth failed. Reopen app.');
    }

    return;
  }

  document.body.classList.remove('telegram-mini-app');
  document.body.classList.remove('is-telegram');
  document.body.classList.add('is-web');

  if (authState.sessionToken && authState.primaryId) {
    logger.info('🌐 Browser mode — restored auth session');
    updateAuthUI();
    await runRequiredPostAuthSync({
      runPostAuthSync,
      logger,
      context: 'browser-restored'
    });
    markAuthReady();
    return;
  }

  logger.info('🌐 Browser mode — wallet auth');
  updateAuthUI();
  markAuthReady();
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