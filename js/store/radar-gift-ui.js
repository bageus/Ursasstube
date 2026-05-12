import { logger } from '../logger.js';
import { BACKEND_URL } from '../config.js';
import { requestJsonResult, REQUEST_PROFILE_STORE_WRITE } from '../request.js';
import { notifyError, notifySuccess, notifyWarn } from '../notifier.js';
import { getPrimaryAuthIdentifier, getSigningWalletAddress } from '../features/auth/index.js';
import { getTelegramInitData } from '../auth-telegram.js';

const RADAR_GIFT_TIERS = [
  { reward: 'radar_obstacles_24h', selectors: ['#store-radarobstacles-0', '[data-upgrade-key="radar_obstacles"][data-upgrade-tier="0"]'] },
  { reward: 'radar_gold_24h', selectors: ['#store-radargold-0', '[data-upgrade-key="radar_gold"][data-upgrade-tier="0"]'] }
];

let isRadarGiftClickInterceptorBound = false;

function formatRemainingHours(endsAt) {
  const ms = Number(endsAt) - Date.now();
  if (ms <= 0) return null;
  return `${Math.max(1, Math.ceil(ms / 3600000))}h`;
}

function rewardFromGiftTargetOrKey(value) {
  switch (value) {
    case 'radar_obstacles_24h':
    case 'gift_radar_obstacles_store':
    case 'radar_obstacles_24h_card':
    case 'radar_obstacles_card':
    case 'radar_obstacles':
      return 'radar_obstacles_24h';

    case 'radar_gold_24h':
    case 'gift_radar_gold_store':
    case 'radar_gold_24h_card':
    case 'radar_gold_card':
    case 'radar_gold':
      return 'radar_gold_24h';

    default:
      return null;
  }
}

async function claimOnboardingGiftReward(rewardKeyOrTarget, { refreshOnboardingState }) {
  const normalizedReward = rewardFromGiftTargetOrKey(String(rewardKeyOrTarget || '').trim());
  if (!normalizedReward) {
    console.warn('⚠️ onboarding gift reward mapping failed', { keyOrTarget: rewardKeyOrTarget });
    return false;
  }
  try {
    const primaryId = getPrimaryAuthIdentifier();
    const wallet = getSigningWalletAddress();
    const telegramInitData = getTelegramInitData();

    if (!primaryId) {
      logger.warn('⚠️ onboarding gift claim skipped: missing primary auth identifier', {
        reward: normalizedReward,
        hasWallet: Boolean(wallet),
        hasTelegramInitData: Boolean(telegramInitData)
      });
      notifyError('❌ Missing auth session for gift claim');
      return false;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Primary-Id': String(primaryId)
    };
    if (wallet) headers['X-Wallet'] = String(wallet);
    if (telegramInitData) headers['X-Telegram-Init-Data'] = telegramInitData;

    const { ok, status, data } = await requestJsonResult(`${BACKEND_URL}/api/onboarding/claim`, {
      ...REQUEST_PROFILE_STORE_WRITE,
      method: 'POST',
      headers,
      body: JSON.stringify({ reward: normalizedReward })
    });
    if (!ok || !data?.success) {
      console.warn('Gift claim failed', { status, data, reward: normalizedReward });
      notifyError(`❌ ${data?.error || 'Gift claim failed'}`);
      return false;
    }
    await refreshOnboardingState({ reason: `gift_claim_${normalizedReward}`, screen: 'store' });
    return true;
  } catch (error) {
    logger.error('❌ onboarding gift claim failed', { reward: normalizedReward, error });
    notifyError('❌ Gift claim failed');
    return false;
  }
}

async function handleGiftClaimAction(rewardKeyOrTarget, handlers) {
  const { buyUpgrade, isStoreDataLoading, loadPlayerUpgrades, updateStoreUI, refreshOnboardingState } = handlers;
  if (isStoreDataLoading()) {
    notifyWarn('⏳ Store is loading, try again in a moment');
    return;
  }
  const claimed = await claimOnboardingGiftReward(rewardKeyOrTarget, { refreshOnboardingState });
  if (!claimed) return;
  await loadPlayerUpgrades();
  updateStoreUI({ buyUpgrade });
  notifySuccess('✅ 24H gift activated');
}

function bindRadarGiftClickInterceptor(handlers) {
  if (isRadarGiftClickInterceptorBound) return;
  isRadarGiftClickInterceptorBound = true;

  document.addEventListener('click', async (event) => {
    const tierEl = event.target?.closest?.('.store-tier.is-gift-free[data-onboarding-gift]');
    if (!tierEl) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const reward = String(tierEl.dataset.onboardingGift || '').trim();
    if (!reward) return;
    await handleGiftClaimAction(reward, handlers);
  }, true);
}

export function applyRadarGiftStoreUi(onboardingState, handlers) {
  bindRadarGiftClickInterceptor(handlers);
  const gifts = onboardingState?.gifts || {};
  const activeBoosts = onboardingState?.activeBoosts || {};

  RADAR_GIFT_TIERS.forEach(({ reward, selectors }) => {
    const tierEl = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!tierEl) return;

    const giftState = gifts[reward] || {};
    const boostState = activeBoosts[reward] || {};
    const giftTimerText = formatRemainingHours(boostState?.endsAt);
    const isGiftBoostActive = boostState?.active === true && Boolean(giftTimerText);
    const isGiftAvailable = giftState.available === true && giftState.claimed !== true;
    const priceEl = tierEl.querySelector('.store-tier-price');

    tierEl.classList.remove('is-gift-free', 'is-gift-active');
    delete tierEl.dataset.onboardingGift;
    delete tierEl.dataset.giftTimer;
    tierEl.style.pointerEvents = '';
    tierEl.onclick = null;

    if (isGiftBoostActive) {
      tierEl.classList.add('is-gift-active');
      tierEl.classList.remove('available');
      tierEl.dataset.giftTimer = giftTimerText;
      if (priceEl) priceEl.textContent = '';
      return;
    }

    if (!isGiftAvailable) return;

    tierEl.classList.add('is-gift-free', 'available');
    tierEl.classList.remove('locked', 'purchased');
    tierEl.dataset.onboardingGift = reward;
    tierEl.style.pointerEvents = 'auto';
    tierEl.style.opacity = '';
    if (priceEl) priceEl.textContent = 'FREE 24H';

    tierEl.onclick = async function claimGiftHandler(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      await handleGiftClaimAction(reward, handlers);
    };
  });
}
