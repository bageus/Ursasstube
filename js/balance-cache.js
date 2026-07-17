const BALANCE_CACHE_PREFIX = 'ursass.balance.v1.';
const BALANCE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let activeBalanceIdentity = '';

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeBalance(value) {
  const gold = toSafeNumber(value?.gold);
  const silver = toSafeNumber(value?.silver);
  if (gold === null && silver === null) return null;
  return {
    gold: gold ?? 0,
    silver: silver ?? 0,
    updatedAt: Math.max(0, Number(value?.updatedAt) || 0)
  };
}

function getRuntimeWindow() {
  return typeof window === 'undefined' ? null : window;
}

function getStorage() {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) return null;
  try {
    return runtimeWindow.localStorage || null;
  } catch (_error) {
    return null;
  }
}

function getMemoryCache(runtimeWindow) {
  if (!runtimeWindow) return null;
  const existing = runtimeWindow.__ursasBalanceCacheByIdentity;
  if (existing && typeof existing === 'object') return existing;
  const next = Object.create(null);
  runtimeWindow.__ursasBalanceCacheByIdentity = next;
  return next;
}

function getStorageKey(identity) {
  return `${BALANCE_CACHE_PREFIX}${encodeURIComponent(identity)}`;
}

function readPersistedBalance(identity) {
  if (!identity) return null;
  const storage = getStorage();
  if (!storage) return null;
  const key = getStorageKey(identity);
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    const cached = normalizeBalance(parsed);
    if (!cached) return null;
    const age = cached.updatedAt > 0 ? Date.now() - cached.updatedAt : 0;
    if (age > BALANCE_CACHE_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    return cached;
  } catch (_error) {
    try { storage.removeItem(key); } catch (_removeError) {}
    return null;
  }
}

function persistBalance(identity, balance) {
  if (!identity) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(getStorageKey(identity), JSON.stringify(balance));
  } catch (_error) {}
}

function writeBalanceToDom(gold, silver) {
  if (typeof document === 'undefined') return;
  [['walletGold', gold], ['walletSilver', silver], ['storeGoldVal', gold], ['storeSilverVal', silver]].forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });
}

function setBalanceCacheIdentity(identity) {
  activeBalanceIdentity = normalizeIdentity(identity);
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) return null;

  if (!activeBalanceIdentity) {
    runtimeWindow.__ursasLastKnownBalance = null;
    return null;
  }

  const memoryCache = getMemoryCache(runtimeWindow);
  const cached = normalizeBalance(memoryCache?.[activeBalanceIdentity])
    || readPersistedBalance(activeBalanceIdentity);

  if (!cached) {
    runtimeWindow.__ursasLastKnownBalance = null;
    return null;
  }

  memoryCache[activeBalanceIdentity] = cached;
  runtimeWindow.__ursasLastKnownBalance = { gold: cached.gold, silver: cached.silver };
  writeBalanceToDom(cached.gold, cached.silver);
  return { gold: cached.gold, silver: cached.silver };
}

function getCachedBalance(identity = activeBalanceIdentity) {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) return null;
  const normalizedIdentity = normalizeIdentity(identity);

  if (!normalizedIdentity) {
    const anonymousBalance = normalizeBalance(runtimeWindow.__ursasLastKnownBalance);
    return anonymousBalance
      ? { gold: anonymousBalance.gold, silver: anonymousBalance.silver }
      : null;
  }

  const memoryCache = getMemoryCache(runtimeWindow);
  const cached = normalizeBalance(memoryCache?.[normalizedIdentity])
    || readPersistedBalance(normalizedIdentity);
  if (!cached) return null;

  memoryCache[normalizedIdentity] = cached;
  return { gold: cached.gold, silver: cached.silver };
}

function updateCachedBalance(balance = {}, options = {}) {
  const identity = normalizeIdentity(options?.identity ?? activeBalanceIdentity);
  const current = getCachedBalance(identity) || { gold: 0, silver: 0 };
  const gold = toSafeNumber(balance?.gold);
  const silver = toSafeNumber(balance?.silver);
  const next = {
    gold: gold ?? current.gold,
    silver: silver ?? current.silver,
    updatedAt: Date.now()
  };

  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow) {
    runtimeWindow.__ursasLastKnownBalance = { gold: next.gold, silver: next.silver };
    if (identity) {
      const memoryCache = getMemoryCache(runtimeWindow);
      memoryCache[identity] = next;
      persistBalance(identity, next);
    }
  }

  writeBalanceToDom(next.gold, next.silver);
  return { gold: next.gold, silver: next.silver };
}

export { getCachedBalance, setBalanceCacheIdentity, updateCachedBalance };
