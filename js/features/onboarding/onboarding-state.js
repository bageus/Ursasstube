const ONBOARDING_STORAGE_KEY = 'ursas.onboarding.state.v1';

const DEFAULT_ONBOARDING_STATE = Object.freeze({
  step: 'unknown',
  completed: false,
  updatedAt: 0,
  raceCount: 0,
  xConnected: false,
  activeOnboarding: null,
  onboarding: {},
  gifts: {
    radar_obstacles_24h: { unlocked: false, claimed: false, skipped: false, available: false },
    radar_gold_24h: { unlocked: false, claimed: false, skipped: false, available: false }
  },
  activeBoosts: {
    radar_obstacles_24h: { active: false, endsAt: 0 },
    radar_gold_24h: { active: false, endsAt: 0 }
  }
});

const normalizeGiftState = (input) => {
  const unlocked = Boolean(input?.unlocked ?? input?.isUnlocked ?? input?.eligible);
  const claimed = Boolean(input?.claimed ?? input?.isClaimed ?? input?.redeemed);
  const skipped = Boolean(input?.skipped ?? input?.isSkipped);
  const availableHints = [
    input?.available,
    input?.isAvailable,
    input?.canClaim,
    input?.claimable,
    input?.eligible,
    input?.unlocked,
    input?.status === 'available'
  ];
  const available = availableHints.some(Boolean) && !claimed;
  return { unlocked, claimed, skipped, available };
};
const toTimestamp = (value) => (Number.isFinite(Number(value)) ? Number(value) : (Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0));
const normalizeBackendBoost = (untilValue, fallbackInput) => { const endsAt = toTimestamp(untilValue) || toTimestamp(fallbackInput?.endsAt); return { active: endsAt > Date.now(), endsAt }; };

function normalizeOnboardingState(input) {
  if (!input || typeof input !== 'object') return { ...DEFAULT_ONBOARDING_STATE };
  const onboarding = input.onboarding && typeof input.onboarding === 'object' ? input.onboarding : input;
  const raceCountCandidates = [
    input.raceCount,
    input.completedRuns,
    input.finishedRuns,
    input.runsCompleted,
    input.stats?.raceCount,
    input.stats?.completedRuns,
    onboarding.raceCount,
    onboarding.completedRuns
  ];
  const normalizedRaceCount = raceCountCandidates.find((value) => Number.isFinite(Number(value)));
  const giftsInput = input.gifts || onboarding.gifts || input.rewards || {};
  const boostsInput = input.activeBoosts || input.active_boosts || onboarding.activeBoosts || onboarding.active_boosts || onboarding.effects || {};
  const activeOnboarding = input.activeOnboarding || onboarding.activeOnboarding || null;
  const onboardingStatusesInput = input.onboardingStatuses || input.onboarding_statuses || onboarding.statuses || onboarding.onboarding || input.onboarding || {};
  const normalizedOnboardingStatuses = Object.entries(onboardingStatusesInput && typeof onboardingStatusesInput === 'object' ? onboardingStatusesInput : {}).reduce((acc, [key, value]) => {
    acc[String(key)] = typeof value === 'string' ? value : 'none';
    return acc;
  }, {});
  return {
    step: input.step || input.currentStep || onboarding.step || 'unknown',
    completed: Boolean(input.completed || input.mainFlowCompleted || onboarding.completed),
    updatedAt: Number.isFinite(Number(onboarding.updatedAt)) ? Number(onboarding.updatedAt) : Date.now(),
    raceCount: Number.isFinite(Number(normalizedRaceCount)) ? Number(normalizedRaceCount) : 0,
    xConnected: Boolean(input.xConnected ?? input.x_connected ?? onboarding.xConnected ?? onboarding.x_connected),
    onboarding: normalizedOnboardingStatuses,
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
