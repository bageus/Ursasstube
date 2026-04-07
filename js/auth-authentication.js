import { authenticateWallet } from './auth-service.js';
import { requestWalletSignature } from './auth-wallet-connector.js';
import { clearRuntimeConfig } from './store.js';
import { authState } from './auth-state.js';
import { logger } from './logger.js';
import { notifyError } from './notifier.js';

async function connectWalletAuthFlow({ applyAuthSession, updateAuthUI, runPostAuthSync, DOM }) {
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
    logger.error('❌ Wallet auth error:', error);
    if (error.code === 4001) notifyError('❌ Request rejected');
    else notifyError(`❌ Error: ${error.message}`);
  } finally {
    authState.isWalletAuthInProgress = false;
  }
}

export { connectWalletAuthFlow };
