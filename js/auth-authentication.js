import { authenticateWallet } from './auth-service.js';
import { requestWalletSignature } from './auth-wallet-connector.js';
import { clearRuntimeConfigBridge as clearRuntimeConfig } from './auth-store-bridge.js';
import { authState } from './auth-state.js';
import { logger } from './logger.js';
import { notifyError } from './notifier.js';
import { trackAnalyticsEvent } from './analytics.js';

async function connectWalletAuthFlow({ applyAuthSession, updateAuthUI, runPostAuthSync, DOM, isWalletAuthMode }) {
  if (authState.isWalletAuthInProgress) return;

  authState.isWalletAuthInProgress = true;
  try {
    const timestamp = Date.now();
    const signedPayload = await requestWalletSignature({ flow: 'auth', timestamp });
    if (!signedPayload) {
      notifyError('❌ Wallet connection failed');
      return;
    }
    const { walletAddress, signature, provider } = signedPayload;

    const data = await authenticateWallet({
      wallet: walletAddress,
      signature,
      timestamp,
    });

    if (data.success) {
      const walletType = typeof isWalletAuthMode === 'function' && isWalletAuthMode()
        ? 'wallet'
        : 'telegram_linked_wallet';
      trackAnalyticsEvent('wallet_connect_success', {
        wallet_type: walletType
      });
      clearRuntimeConfig();
      applyAuthSession({
        nextAuthMode: 'wallet',
        nextPrimaryId: data.primaryId,
        nextUserWallet: String(data.wallet || walletAddress || data.primaryId || '').toLowerCase() || null,
        nextIsWalletConnected: true,
        nextLinkedTelegramId: data.telegramId,
        nextLinkedTelegramUsername: data.telegramUsername || null,
        nextLinkedWallet: null,
        nextWeb3: provider,
      });
      logger.info('✅ Wallet auth OK:', authState.primaryId);

      updateAuthUI();
      await runPostAuthSync();

      if (DOM.storeBtn) DOM.storeBtn.classList.remove('menu-hidden');
    }
  } catch (error) {
    trackAnalyticsEvent('wallet_connect_failed', {
      reason: error?.code === 4001 ? 'user_rejected' : 'connect_failed'
    });
    logger.error('❌ Wallet auth error:', error);
    if (error.code === 4001) notifyError('❌ Request rejected');
    else notifyError(`❌ Error: ${error.message}`);
  } finally {
    authState.isWalletAuthInProgress = false;
  }
}

export { connectWalletAuthFlow };
