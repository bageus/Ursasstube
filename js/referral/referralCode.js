const REF_MAX_LENGTH = 64;
const REF_SAFE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function normalizeReferralCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const candidate = raw.startsWith('ref_') ? raw.slice(4) : raw;
  const normalized = candidate.trim();
  if (!normalized || normalized.length > REF_MAX_LENGTH) return '';
  if (!REF_SAFE_PATTERN.test(normalized)) return '';
  return normalized;
}

function readReferralCodeFromTelegram() {
  try {
    const tgData = window?.Telegram?.WebApp?.initDataUnsafe || null;
    const startParam = tgData?.start_param || tgData?.startapp || '';
    return normalizeReferralCode(startParam);
  } catch {
    return '';
  }
}

function readReferralCodeFromLocation(search = '') {
  const params = new URLSearchParams(String(search || ''));
  return normalizeReferralCode(params.get('ref') || '');
}

export {
  normalizeReferralCode,
  readReferralCodeFromTelegram,
  readReferralCodeFromLocation
};
