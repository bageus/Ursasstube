import { sanitizeTelegramHandle } from './security.js';
import { showTelegramLinkOverlay } from './auth-link-telegram-overlay.js';
import { linkWalletToTelegram, requestTelegramLinkCode } from './auth-service.js';
import { requestWalletSignature } from './auth-wallet-connector.js';
import { authState } from './auth-state.js';
import { logger } from './logger.js';
import { notifyError, notifySuccess } from './notifier.js';

async function linkTelegramFlow() {
  if (authState.authMode !== 'wallet' || !authState.primaryId) return;

  try {
    const { ok, data } = await requestTelegramLinkCode({ primaryId: authState.primaryId });

    if (!ok || !data.success) {
      notifyError(`❌ ${data.error || 'Failed to generate code'}`);
      return;
    }

    const code = String(data.code || '----');
    const botUsername = sanitizeTelegramHandle(data.botUsername, 'Ursasstube_bot');
    const botLink = `https://t.me/${encodeURIComponent(botUsername)}`;

    showTelegramLinkOverlay({ code, botUsername, botLink });
  } catch (error) {
    logger.error('❌ Link telegram error:', error);
    notifyError('❌ Network error. Try again.');
  }
}

async function linkWalletFlow({ applyAuthSession, updateAuthUI, runPostAuthSync }) {
  if (authState.authMode !== 'telegram' || !authState.primaryId || authState.isWalletLinkInProgress) return;

  authState.isWalletLinkInProgress = true;
  try {
    const timestamp = Date.now();
    const signedPayload = await requestWalletSignature({
      flow: 'link',
      primaryId: authState.primaryId,
      timestamp,
    });
    if (!signedPayload) return;

    const { walletAddress, signature } = signedPayload;
    const data = await linkWalletToTelegram({
      primaryId: authState.primaryId,
      wallet: walletAddress,
      signature,
      timestamp,
    });

    if (data.success) {
      applyAuthSession({
        nextAuthMode: 'telegram',
        nextPrimaryId: data.primaryId,
        nextTelegramUser: authState.telegramUser,
        nextLinkedWallet: data.wallet,
        nextIsWalletConnected: true,
        nextUserWallet: String(data.wallet || walletAddress || data.primaryId || '').toLowerCase() || null,
      });

      if (data.merged) {
        notifySuccess(`✅ Accounts merged! Master: score ${data.masterScore}; Slave score ${data.slaveScoreWas} — reset`, { durationMs: 8000 });
      } else {
        notifySuccess('✅ Wallet linked!');
      }

      updateAuthUI();
      await runPostAuthSync({ withLeaderboard: false, withRidesDisplay: false });
    } else {
      notifyError(`❌ ${data.error}`);
    }
  } catch (error) {
    logger.error('❌ Link wallet error:', error);
  } finally {
    authState.isWalletLinkInProgress = false;
  }
}

export {
  linkTelegramFlow,
  linkWalletFlow,
};
