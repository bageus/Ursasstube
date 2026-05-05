import { fetchMyProfile, startShare, confirmShare, getXOAuthAuthorizeUrl } from '../api.js';
import { notifySuccess, notifyError, notifyWarn } from '../notifier.js';
import { isTelegramMiniApp, getPrimaryAuthIdentifier, getSigningWalletAddress } from '../features/auth/index.js';
import { logger } from '../logger.js';
import { analytics } from '../analytics-events.js';
import { BACKEND_URL } from '../config.js';

const SHARE_CONFIRM_DELAY_MS = 33000; // 30s minimum + 3s buffer for network latency
const SHARE_CONFIRM_RETRY_BUFFER_MS = 1200;

const EXPERIMENTAL_FRONTEND_X_IMAGE_SHARE = true;
const EXPERIMENTAL_FRONTEND_X_IMAGE_PATH = '/assets/bonus_invert.png';
const EXPERIMENTAL_X_COMPOSE_URL = 'https://x.com/compose/post';



async function tryExperimentalNativeImageShare(context) {
  if (!navigator.share || !window.File) return false;
  try {
    const origin = window.location?.origin || '';
    const imageUrl = `${origin}${EXPERIMENTAL_FRONTEND_X_IMAGE_PATH}`;
    const response = await fetch(imageUrl, { cache: 'no-store' });
    if (!response.ok) return false;
    const blob = await response.blob();
    const fileName = EXPERIMENTAL_FRONTEND_X_IMAGE_PATH.split('/').pop() || 'share.png';
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });

    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      return false;
    }

    await navigator.share({
      text: 'Experimental share from Ursasstube',
      files: [file]
    });
    analytics.shareIntentOpened({ context, reason: 'experimental_frontend_native_image_share' });
    // EXPERIMENT: after successful native share, open X composer page explicitly.
    openUrl(EXPERIMENTAL_X_COMPOSE_URL);
    return true;
  } catch (e) {
    logger.warn('⚠️ Native image share failed:', e);
    return false;
  }
}
function openUrl(url) {
  if (isTelegramMiniApp() && window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function openTextShareIntent(intentUrl, context, reason) {
  if (!intentUrl) return;
  openUrl(intentUrl);
  analytics.shareIntentOpened({ context, reason });
}

function handleShareContractError({ errorCode, contractFallback, mediaResult, intentUrl, context }) {
  if (contractFallback === 'text_intent') {
    notifyWarn('Не удалось опубликовать изображение. Можно поделиться текстом.', {
      sticky: true,
      actionLabel: 'Поделиться текстом',
      onAction: () => openTextShareIntent(intentUrl, context, 'contract_fallback_text_intent')
    });
    return { success: false, errorCode, fallbackIntentUrl: intentUrl || null };
  }

  if (errorCode === 'x_auth_expired') {
    notifyWarn('Сессия X истекла. Подключите X снова.', {
      sticky: true,
      actionLabel: 'Подключить X снова',
      onAction: () => {
        startXConnectFlow().catch((e) => logger.warn('⚠️ X reconnect failed:', e));
      }
    });
    return { success: false, errorCode };
  }

  if (errorCode === 'x_rate_limited') {
    notifyWarn('X временно ограничил публикации. Попробуйте чуть позже.');
    return { success: false, errorCode };
  }

  if (mediaResult.status >= 500) {
    notifyError('Не удалось поделиться, попробуйте позже.');
    return { success: false, errorCode };
  }

  notifyError('Не удалось поделиться, попробуйте позже.');
  return { success: false, errorCode };
}

async function postShareResultMedia(shareResultEndpoint, payload = {}) {
  const endpoint = String(shareResultEndpoint || '').trim();
  if (!endpoint) return { ok: false, status: 400 };
  const primaryId = getPrimaryAuthIdentifier();
  const wallet = getSigningWalletAddress();
  const headers = { 'Content-Type': 'application/json' };
  if (primaryId) {
    headers['X-Primary-Id'] = String(primaryId);
    headers['X-Wallet'] = String(wallet || primaryId);
  }
  if (isTelegramMiniApp() && window.Telegram?.WebApp?.initData) {
    headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
  }
  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

async function performShare({ context = 'menu', profile = null, onProfileUpdated = null } = {}) {
  analytics.shareResultClicked({ context });

  if (EXPERIMENTAL_FRONTEND_X_IMAGE_SHARE) {
    // EXPERIMENT: Web Share API only (no backend, no link fallback) to validate real image attachment.
    const sharedAsImage = await tryExperimentalNativeImageShare(context);
    if (!sharedAsImage) {
      notifyWarn('⚠️ Web Share API с файлом недоступен на этом устройстве/браузере.');
      return { success: false, experimentalFrontendOnly: true, sharedAsImage: false };
    }
    return { success: true, experimentalFrontendOnly: true, sharedAsImage: true };
  }

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

  const {
    shareId,
    intentUrl,
    shareResultApiUrl,
    shareResultEndpoint,
    preferredShareFlow,
    secondsUntilReward = 30,
    eligibleForReward
  } = startResp;

  const shareResultUrl = shareResultApiUrl || shareResultEndpoint;

  if (preferredShareFlow === 'x_api') {
    if (!shareResultUrl) {
      notifyError('⚠️ Share API endpoint missing. Please try again.');
      analytics.shareResultApiError({
        context,
        code: 'x_api_missing_endpoint'
      });
      return { success: false };
    }

    try {
      const mediaResult = await postShareResultMedia(shareResultUrl, { shareId, context });
      if (mediaResult.ok && mediaResult.data?.posted) {
        const tweetUrl = mediaResult.data?.tweetUrl || mediaResult.data?.url || mediaResult.data?.postUrl;
        notifySuccess('✅ Shared to X');
        if (tweetUrl) {
          openUrl(tweetUrl);
        }
        analytics.shareResultApiSuccess({ context, tweet_url_present: Boolean(tweetUrl) });
      } else {
        const errorCode = mediaResult.data?.code || mediaResult.data?.error || `http_${mediaResult.status}`;
        analytics.shareResultApiError({ context, code: errorCode, status: mediaResult.status });
        const contractFallback = mediaResult.data?.fallback || null;
        return handleShareContractError({ errorCode, contractFallback, mediaResult, intentUrl, context });
      }
    } catch (e) {
      logger.warn('⚠️ share media attach request error:', e);
      notifyError('Не удалось поделиться, попробуйте позже.');
      analytics.shareResultApiError({ context, code: 'network_error' });
      return { success: false, errorCode: 'network_error', fallbackIntentUrl: intentUrl || null };
    }
  } else if (preferredShareFlow === 'intent') {
    if (EXPERIMENTAL_FRONTEND_X_IMAGE_SHARE) {
      // EXPERIMENT: client-only X flow with a fixed front-end image URL.
      openExperimentalFrontendXImageIntent(context);
    } else if (intentUrl) {
      openTextShareIntent(intentUrl, context, 'preferred_share_flow_intent');
    }
  } else if (intentUrl) {
    openTextShareIntent(intentUrl, context, 'fallback_unknown_preferred_flow');
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
