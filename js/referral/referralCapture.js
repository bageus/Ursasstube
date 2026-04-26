import { logger } from '../logger.js';
import { trackReferral } from '../api.js';

const STORAGE_KEY = 'ursas_ref';
// Referral codes are exactly 8 uppercase alphanumeric characters (nanoid-based, see backend Player model)
const REF_PATTERN = /^[A-Z0-9]{8}$/;

function captureReferralFromUrl() {
  if (typeof location === 'undefined') return;

  const params = new URLSearchParams(location.search);
  const ref = params.get('ref');
  if (!ref) return;

  const clean = String(ref).trim().toUpperCase();
  if (!REF_PATTERN.test(clean)) {
    logger.warn('⚠️ Referral code invalid format:', clean);
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, clean);
      logger.info('📎 Referral code captured:', clean);
    } catch (_e) {
      // localStorage may be unavailable
    }
  }

  params.delete('ref');
  const newSearch = params.toString();
  const newUrl = newSearch
    ? `${location.pathname}?${newSearch}${location.hash}`
    : `${location.pathname}${location.hash}`;
  try {
    history.replaceState(null, '', newUrl);
  } catch (_e) {
    // replaceState may be unavailable in some contexts
  }
}

async function sendReferralAfterAuth() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (_e) {
    return;
  }

  if (!stored) return;

  const clean = String(stored).trim().toUpperCase();
  if (!REF_PATTERN.test(clean)) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* ignore */ }
    return;
  }

  const { ok, data } = await trackReferral(clean);
  if (ok || (data && data.already) || (data && data.error)) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* ignore */ }
    if (ok) logger.info('✅ Referral tracked:', clean);
  } else {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* ignore */ }
    logger.warn('⚠️ Referral track failed — removed from storage');
  }
}

export { captureReferralFromUrl, sendReferralAfterAuth };
