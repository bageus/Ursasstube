function parseNumericLevel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseSpinAlertLevel(value) {
  const numeric = parseNumericLevel(value);
  if (numeric > 0) return Math.min(numeric, 2);

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 0;

  if (['perfect', 'pro', 'perfect_alert', 'perfectalert', 'tier2', 'level2'].includes(normalized)) {
    return 2;
  }

  if (['alert', 'basic', 'tier1', 'level1', 'enabled', 'active'].includes(normalized)) {
    return 1;
  }

  if (normalized === 'true') return 1;

  return 0;
}

function getLevelFromUpgradeState(state = null, upgradeKey = '') {
  if (!state || typeof state !== 'object') return 0;

  const parseLevel = upgradeKey === 'spin_alert' ? parseSpinAlertLevel : parseNumericLevel;
  const directCandidates = [state.currentLevel, state.level, state.purchasedLevel, state.ownedLevel];

  let bestLevel = directCandidates.reduce((best, candidate) => Math.max(best, parseLevel(candidate)), 0);

  const arrayCandidates = [state.purchasedTiers, state.ownedTiers, state.unlockedTiers];
  for (const tiers of arrayCandidates) {
    if (!Array.isArray(tiers) || tiers.length === 0) continue;

    const numericTiers = tiers.map((tier) => parseLevel(tier)).filter((tier) => Number.isFinite(tier));
    if (numericTiers.length === 0) continue;

    const highestTier = Math.max(...numericTiers);
    bestLevel = upgradeKey === 'spin_alert'
      ? Math.max(bestLevel, highestTier)
      : Math.max(bestLevel, highestTier + 1);
  }

  return bestLevel;
}

function normalizeShieldCapacityLevel(...candidates) {
  return candidates.reduce((best, candidate) => {
    const parsed = parseNumericLevel(candidate);
    if (parsed <= 0) return best;
    const normalized = parsed >= 2 ? parsed - 1 : parsed;
    return Math.max(best, Math.min(normalized, 2));
  }, 0);
}

export {
  parseNumericLevel,
  parseSpinAlertLevel,
  getLevelFromUpgradeState,
  normalizeShieldCapacityLevel
};
