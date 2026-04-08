const ONBOARDING_HINT_SEEN_KEY = 'ursas.onboarding_hint_seen_v1';

function hasStorageApi(storage) {
  return Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
}

function shouldShowFirstRunHint(storage) {
  if (!hasStorageApi(storage)) return true;
  try {
    return storage.getItem(ONBOARDING_HINT_SEEN_KEY) !== '1';
  } catch (_error) {
    return true;
  }
}

function markFirstRunHintShown(storage) {
  if (!hasStorageApi(storage)) return;
  try {
    storage.setItem(ONBOARDING_HINT_SEEN_KEY, '1');
  } catch (_error) {
    // noop: storage might be unavailable in privacy/embedded contexts
  }
}

function getOnboardingHintTimeline() {
  return [
    { delayMs: 900, text: '👆 Swipe to change lane' },
    { delayMs: 2600, text: '🛡 Collect bonuses, avoid obstacles' }
  ];
}

export {
  getOnboardingHintTimeline,
  markFirstRunHintShown,
  shouldShowFirstRunHint
};
