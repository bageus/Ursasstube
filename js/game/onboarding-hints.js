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
  const defaultTimeline = [
    { delayMs: 900, text: '👆 Swipe to change lane' },
    { delayMs: 2600, text: '🛡 Collect bonuses, avoid obstacles' }
  ];
  return defaultTimeline;
}

function getInputProfile(env = {}) {
  const nav = env?.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav) return 'keyboard';

  const maxTouchPoints = Number(nav.maxTouchPoints || 0);
  const coarseTouch = Boolean(maxTouchPoints > 0);
  return coarseTouch ? 'touch' : 'keyboard';
}

function getOnboardingHintTimelineByProfile(profile = 'touch') {
  if (profile === 'keyboard') {
    return [
      { delayMs: 900, text: '⌨️ Use A/D or ←/→ to change lane' },
      { delayMs: 2600, text: '🛡 Collect bonuses, avoid obstacles' }
    ];
  }

  return [
    { delayMs: 900, text: '👆 Swipe to change lane' },
    { delayMs: 2600, text: '🛡 Collect bonuses, avoid obstacles' }
  ];
}

export {
  getInputProfile,
  getOnboardingHintTimeline,
  getOnboardingHintTimelineByProfile,
  markFirstRunHintShown,
  shouldShowFirstRunHint
};
