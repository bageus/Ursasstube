const ONBOARDING_STORAGE_KEY = 'ursas.onboarding.state.v1';

const DEFAULT_ONBOARDING_STATE = Object.freeze({
  step: 'unknown',
  completed: false,
  updatedAt: 0,
  gifts: {
    radar_obstacles_24h: { unlocked: false, claimed: false, skipped: false },
    radar_gold_24h: { unlocked: false, claimed: false, skipped: false }
  },
  activeBoosts: {
    radar_obstacles_24h: { active: false, endsAt: 0 },
    radar_gold_24h: { active: false, endsAt: 0 }
  }
});

function normalizeGiftState(input) {
  return {
    unlocked: Boolean(input?.unlocked),
    claimed: Boolean(input?.claimed),
    skipped: Boolean(input?.skipped)
  };
}

function normalizeBoostState(input) {
  return {
    active: Boolean(input?.active),
    endsAt: Number.isFinite(Number(input?.endsAt)) ? Number(input.endsAt) : 0
  };
}

function normalizeOnboardingState(input) {
  if (!input || typeof input !== 'object') return { ...DEFAULT_ONBOARDING_STATE };
  const step = typeof input.step === 'string' && input.step.trim() ? input.step.trim() : DEFAULT_ONBOARDING_STATE.step;
  const completed = Boolean(input.completed);
  const updatedAt = Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : Date.now();
  const giftsInput = input.gifts || input.rewards || {};
  const boostsInput = input.activeBoosts || input.active_boosts || input.effects || {};
  return {
    step,
    completed,
    updatedAt,
    gifts: {
      radar_obstacles_24h: normalizeGiftState(giftsInput.radar_obstacles_24h || giftsInput.radarObstacles24h || giftsInput.radarObstacles),
      radar_gold_24h: normalizeGiftState(giftsInput.radar_gold_24h || giftsInput.radarGold24h || giftsInput.radarGold)
    },
    activeBoosts: {
      radar_obstacles_24h: normalizeBoostState(boostsInput.radar_obstacles_24h || boostsInput.radarObstacles24h || boostsInput.radarObstacles),
      radar_gold_24h: normalizeBoostState(boostsInput.radar_gold_24h || boostsInput.radarGold24h || boostsInput.radarGold)
    }
  };
}

function readCachedOnboardingState(storage = window?.localStorage) {
  try {
    const raw = storage?.getItem?.(ONBOARDING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ONBOARDING_STATE };
    return normalizeOnboardingState(JSON.parse(raw));
  } catch (_error) {
    return { ...DEFAULT_ONBOARDING_STATE };
  }
}

function writeCachedOnboardingState(nextState, storage = window?.localStorage) {
  const normalized = normalizeOnboardingState(nextState);
  try {
    storage?.setItem?.(ONBOARDING_STORAGE_KEY, JSON.stringify(normalized));
  } catch (_error) {
  }
  return normalized;
}

export {
  DEFAULT_ONBOARDING_STATE,
  normalizeOnboardingState,
  readCachedOnboardingState,
  writeCachedOnboardingState
};
