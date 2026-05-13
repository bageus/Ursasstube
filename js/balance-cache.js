function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getCachedBalance() {
  if (typeof window === 'undefined') return null;
  const cached = window.__ursasLastKnownBalance;
  const gold = toSafeNumber(cached?.gold);
  const silver = toSafeNumber(cached?.silver);
  if (gold === null && silver === null) return null;
  return {
    gold: gold ?? 0,
    silver: silver ?? 0
  };
}

function writeBalanceToDom(gold, silver) {
  [['walletGold', gold], ['walletSilver', silver], ['storeGoldVal', gold], ['storeSilverVal', silver]].forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });
}

function updateCachedBalance(balance = {}) {
  const current = getCachedBalance() || { gold: 0, silver: 0 };
  const gold = toSafeNumber(balance?.gold);
  const silver = toSafeNumber(balance?.silver);
  const next = {
    gold: gold ?? current.gold,
    silver: silver ?? current.silver
  };
  if (typeof window !== 'undefined') window.__ursasLastKnownBalance = next;
  writeBalanceToDom(next.gold, next.silver);
  return next;
}

export { getCachedBalance, updateCachedBalance };
