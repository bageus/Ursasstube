import { fetchMyProfile, startShare, confirmShare, getXOAuthAuthorizeUrl } from '../api.js';
import { notifySuccess, notifyError, notifyWarn } from '../notifier.js';
import { isTelegramMiniApp } from '../auth.js';
import { logger } from '../logger.js';

const SHARE_CONFIRM_DELAY_MS = 33000; // 30s minimum + 3s buffer for network latency
const SHARE_CONFIRM_RETRY_BUFFER_MS = 1200;

function openUrl(url) {
  if (isTelegramMiniApp() && window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function performShare({ context = 'menu', profile = null, onProfileUpdated = null } = {}) {
  let currentProfile = profile;

  if (!currentProfile) {
    currentProfile = await fetchMyProfile();
  }

  if (!currentProfile) {
    notifyError('⚠️ Could not load profile. Please try again.');
    return { success: false };
  }

  if (!currentProfile.x?.connected) {
    await startXConnectFlow();
    return { success: false, redirectedToX: true };
  }

  let startResp;
  try {
    const result = await startShare();
    if (!result.ok) {
      notifyError('⚠️ Could not start share. Please try again.');
      return { success: false };
    }
    startResp = result.data;
  } catch (e) {
    logger.error('❌ startShare error:', e);
    notifyError('⚠️ Share service unavailable.');
    return { success: false };
  }

  const { shareId, intentUrl, secondsUntilReward = 30, eligibleForReward } = startResp;

  if (intentUrl) {
    openUrl(intentUrl);
  }

  if (!shareId) {
    return { success: true };
  }

  const startedAt = Date.now();
  const minWaitMs = Math.max((Number(secondsUntilReward) || 30) * 1000, SHARE_CONFIRM_DELAY_MS);

  async function tryConfirm() {
    const elapsed = Date.now() - startedAt;
    const remaining = minWaitMs - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    try {
      const result = await confirmShare(shareId);

      if (result.status === 425) {
        const retryAfter = Number(result.data?.secondsLeft || 5);
        const retryMs = (retryAfter + 1) * 1000 + SHARE_CONFIRM_RETRY_BUFFER_MS;
        logger.warn(`⏳ Share too early — retrying in ${retryAfter + 1}s`);
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        return tryConfirm();
      }

      if (result.ok && result.data) {
        const { awarded, goldAwarded, shareStreak } = result.data;
        if (awarded && goldAwarded > 0) {
          notifySuccess(`+${goldAwarded} 🪙 gold earned for sharing!`);
        } else if (eligibleForReward === false) {
          notifySuccess('✅ Shared! Come back tomorrow for a gold reward.');
        } else {
          notifySuccess('✅ Shared!');
        }
        if (typeof onProfileUpdated === 'function') {
          onProfileUpdated({ shareStreak, totalGold: result.data.totalGold });
        }
        return { success: true, awarded, goldAwarded };
      }

      return { success: true };
    } catch (e) {
      logger.warn('⚠️ confirmShare error:', e);
      return { success: false };
    }
  }

  tryConfirm().catch((e) => logger.warn('⚠️ Share confirm failed:', e));

  return { success: true };
}

async function startXConnectFlow({ onConnected = null } = {}) {
  const authorizeUrl = await getXOAuthAuthorizeUrl();
  if (!authorizeUrl) {
    notifyError('⚠️ X connect is unavailable. Please try again later.');
    return;
  }

  openUrl(authorizeUrl);

  let pollCount = 0;
  const maxPolls = 30;
  const pollInterval = 2000;

  const poll = async () => {
    if (pollCount >= maxPolls) return;
    pollCount++;

    const params = new URLSearchParams(window.location.search);
    if (params.get('x') === 'connected') {
      const username = params.get('username') || '';
      notifySuccess(`✅ X connected${username ? ` as @${username}` : ''}!`);
      if (typeof onConnected === 'function') onConnected({ username });
      return;
    }

    setTimeout(poll, pollInterval);
  };

  const onFocus = async () => {
    window.removeEventListener('focus', onFocus);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const params = new URLSearchParams(window.location.search);
    if (params.get('x') === 'connected') {
      const username = params.get('username') || '';
      notifySuccess(`✅ X connected${username ? ` as @${username}` : ''}!`);
      if (typeof onConnected === 'function') onConnected({ username });
    } else {
      notifyWarn('ℹ️ X not connected yet. Check back after authorizing.');
    }
  };
  window.addEventListener('focus', onFocus, { once: true });

  setTimeout(poll, pollInterval);
}

export { performShare, startXConnectFlow };
