import { logger } from '../logger.js';
import { BACKEND_URL } from '../config.js';
import { requestJsonResult, REQUEST_PROFILE_STORE_WRITE } from '../request.js';
import { notifyError, notifySuccess, notifyWarn } from '../notifier.js';

const RADAR_GIFT_TIERS = [
  { reward: 'radar_obstacles_24h', selectors: ['#store-radarobstacles-0', '[data-upgrade-key="radar_obstacles"][data-upgrade-tier="0"]'] },
  { reward: 'radar_gold_24h', selectors: ['#store-radargold-0', '[data-upgrade-key="radar_gold"][data-upgrade-tier="0"]'] }
];

let isRadarGiftClickInterceptorBound = false;

async function claimOnboardingGiftReward(reward, { refreshOnboardingState }) {
  const normalizedReward = String(reward || '').trim();
  if (!normalizedReward) return false;
  try {
    const { ok, data } = await requestJsonResult(`${BACKEND_URL}/api/onboarding/claim`, {
      ...REQUEST_PROFILE_STORE_WRITE,
      method: 'POST',
      body: JSON.stringify({ reward: normalizedReward })
    });
    if (!ok || !data?.success) {
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

function bindRadarGiftClickInterceptor(handlers) {
  if (isRadarGiftClickInterceptorBound) return;
  isRadarGiftClickInterceptorBound = true;

  document.addEventListener('click', async (event) => {
    const tierEl = event.target?.closest?.('.store-tier.is-gift-free[data-onboarding-gift]');
    if (!tierEl) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const { buyUpgrade, isStoreDataLoading, loadPlayerUpgrades, updateStoreUI, refreshOnboardingState } = handlers;
    const reward = String(tierEl.dataset.onboardingGift || '').trim();
    if (!reward) return;
    if (isStoreDataLoading()) {
      notifyWarn('⏳ Store is loading, try again in a moment');
      return;
    }
    const claimed = await claimOnboardingGiftReward(reward, { refreshOnboardingState });
    if (!claimed) return;
    await loadPlayerUpgrades();
    updateStoreUI({ buyUpgrade });
    notifySuccess('✅ 24H gift activated');
  }, true);
}

export function applyRadarGiftStoreUi(onboardingState, handlers) {
  const { buyUpgrade, isStoreDataLoading, loadPlayerUpgrades, updateStoreUI, refreshOnboardingState } = handlers;
  bindRadarGiftClickInterceptor(handlers);
  const gifts = onboardingState?.gifts || {};

  RADAR_GIFT_TIERS.forEach(({ reward, selectors }) => {
    const tierEl = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!tierEl) return;

    const giftState = gifts[reward] || {};
    const isGiftAvailable = giftState.available === true && giftState.claimed !== true;
    const priceEl = tierEl.querySelector('.store-tier-price');

    tierEl.classList.remove('is-gift-free');
    delete tierEl.dataset.onboardingGift;

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
      if (isStoreDataLoading()) {
        notifyWarn('⏳ Store is loading, try again in a moment');
        return;
      }
      const claimed = await claimOnboardingGiftReward(reward, { refreshOnboardingState });
      if (!claimed) return;
      await loadPlayerUpgrades();
      updateStoreUI({ buyUpgrade });
      notifySuccess('✅ 24H gift activated');
    };
  });
}
