const ONBOARDING_STORAGE_KEY = 'ursas.onboarding.state.v1';

const DEFAULT_ONBOARDING_STATE = Object.freeze({
  step: 'unknown',
  completed: false,
  updatedAt: 0,
  raceCount: 0,
  activeOnboarding: null,
  gifts: {
    radar_obstacles_24h: { unlocked: false, claimed: false, skipped: false, available: false },
    radar_gold_24h: { unlocked: false, claimed: false, skipped: false, available: false }
  },
  activeBoosts: {
    radar_obstacles_24h: { active: false, endsAt: 0 },
    radar_gold_24h: { active: false, endsAt: 0 }
  }
});

const normalizeGiftState = (input) => ({ unlocked: Boolean(input?.unlocked), claimed: Boolean(input?.claimed), skipped: Boolean(input?.skipped), available: Boolean(input?.available || input?.unlocked) });
const toTimestamp = (value) => (Number.isFinite(Number(value)) ? Number(value) : (Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0));
const normalizeBackendBoost = (untilValue, fallbackInput) => { const endsAt = toTimestamp(untilValue) || toTimestamp(fallbackInput?.endsAt); return { active: endsAt > Date.now(), endsAt }; };

function normalizeOnboardingState(input) {
  if (!input || typeof input !== 'object') return { ...DEFAULT_ONBOARDING_STATE };
  const onboarding = input.onboarding && typeof input.onboarding === 'object' ? input.onboarding : input;
  const giftsInput = input.gifts || onboarding.gifts || input.rewards || {};
  const boostsInput = onboarding.activeBoosts || onboarding.active_boosts || onboarding.effects || {};
  const activeOnboarding = input.activeOnboarding || onboarding.activeOnboarding || null;
  return {
    step: typeof onboarding.step === 'string' ? onboarding.step : 'unknown',
    completed: Boolean(onboarding.completed),
    updatedAt: Number.isFinite(Number(onboarding.updatedAt)) ? Number(onboarding.updatedAt) : Date.now(),
    raceCount: Number.isFinite(Number(input.raceCount)) ? Number(input.raceCount) : 0,
    activeOnboarding: activeOnboarding && typeof activeOnboarding === 'object' ? {
      key: activeOnboarding.key || '', screen: activeOnboarding.screen || '', target: activeOnboarding.target || '',
      status: activeOnboarding.status || '', hook: activeOnboarding.hook || '', rewardPreview: activeOnboarding.rewardPreview || null
    } : null,
    gifts: {
      radar_obstacles_24h: normalizeGiftState(giftsInput.radar_obstacles_24h || giftsInput.radarObstacles24h || giftsInput.radarObstacles),
      radar_gold_24h: normalizeGiftState(giftsInput.radar_gold_24h || giftsInput.radarGold24h || giftsInput.radarGold)
    },
    activeBoosts: {
      radar_obstacles_24h: normalizeBackendBoost(boostsInput.radarObstaclesUntil, boostsInput.radar_obstacles_24h),
      radar_gold_24h: normalizeBackendBoost(boostsInput.radarGoldUntil, boostsInput.radar_gold_24h)
    }
  };
}

function readCachedOnboardingState(storage = window?.localStorage) { try { const raw = storage?.getItem?.(ONBOARDING_STORAGE_KEY); return raw ? normalizeOnboardingState(JSON.parse(raw)) : { ...DEFAULT_ONBOARDING_STATE }; } catch (_) { return { ...DEFAULT_ONBOARDING_STATE }; } }
function writeCachedOnboardingState(nextState, storage = window?.localStorage) { const normalized = normalizeOnboardingState(nextState); try { storage?.setItem?.(ONBOARDING_STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {} return normalized; }

export { DEFAULT_ONBOARDING_STATE, normalizeOnboardingState, readCachedOnboardingState, writeCachedOnboardingState };
