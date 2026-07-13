import { fetchMyProfile, isAuthenticated } from '../../api.js';
import { getAuthStateSnapshot, hasWalletAuthSession, hideWalletButtonInTelegram, isTelegramMiniApp } from '../../features/auth/index.js';
import { applyOnboardingForScreen, refreshOnboardingState } from '../../features/onboarding/index.js';
import { isPlayerMenuOpen, refreshPlayerMenu } from '../../features/player-menu/index.js';
import { notifyError, notifySuccess } from '../../notifier.js';
import { DOM } from '../../state.js';
import { shouldShowFirstRunHint } from '../onboarding-hints.js';

let cachedProfile = null;
let profileCacheTimestamp = 0;
const PROFILE_CACHE_TTL_MS = 30000;
const ONBOARDING_GAME_OVER_RETRY_ATTEMPTS = 5;
const ONBOARDING_GAME_OVER_RETRY_DELAY_MS = 500;

function enforceTelegramWalletUiHidden() {
  if (!(window.__URSASS_IS_TELEGRAM_RUNTIME__ || isTelegramMiniApp()) || typeof document === 'undefined') return;
  document.documentElement?.classList.add('telegram-runtime');
  document.body?.classList.add('telegram-runtime');
  hideWalletButtonInTelegram();
}
async function getCachedProfile() {
  const now = Date.now();
  if (cachedProfile && (now - profileCacheTimestamp) < PROFILE_CACHE_TTL_MS) {
    return cachedProfile;
  }
  cachedProfile = await fetchMyProfile();
  profileCacheTimestamp = Date.now();
  return cachedProfile;
}
function invalidateProfileCache() {
  cachedProfile = null;
  profileCacheTimestamp = 0;
}
let onboardingGameOverRetryTimer = null;
let onboardingGameOverRetryJobId = 0;
function cancelGameOverOnboardingRetries() {
  onboardingGameOverRetryJobId += 1;
  if (onboardingGameOverRetryTimer) {
    clearTimeout(onboardingGameOverRetryTimer);
    onboardingGameOverRetryTimer = null;
  }
}
async function refreshOnboardingAfterLeaderboardSaveSuccess() {
  if (!isTelegramMiniApp()) return;
  cancelGameOverOnboardingRetries();
  const jobId = onboardingGameOverRetryJobId;
  const ensureCurrentScreen = () => document?.body?.dataset?.screen === 'game-over';
  for (let attempt = 1; attempt <= ONBOARDING_GAME_OVER_RETRY_ATTEMPTS; attempt += 1) {
    if (jobId !== onboardingGameOverRetryJobId || !ensureCurrentScreen()) return;
    const state = await refreshOnboardingState({
      reason: attempt === 1 ? 'telegram_run_save_success' : 'telegram_run_save_success_retry',
      screen: 'game-over',
      resetCache: true
    }).catch(() => null);
    if (jobId !== onboardingGameOverRetryJobId || !ensureCurrentScreen()) return;
    applyOnboardingForScreen('game-over');
    if (Number(state?.raceCount) >= 1) return;
    if (attempt === ONBOARDING_GAME_OVER_RETRY_ATTEMPTS) return;
    await new Promise((resolve) => {
      onboardingGameOverRetryTimer = setTimeout(resolve, ONBOARDING_GAME_OVER_RETRY_DELAY_MS);
    });
    onboardingGameOverRetryTimer = null;
  }
}
async function updateGameOverShareButton() {
  const shareBtn = DOM.shareResultBtn;
  if (!shareBtn) return;
  if (!isAuthenticated()) {
    shareBtn.hidden = true;
    return;
  }
  shareBtn.hidden = false;
  const profile = await getCachedProfile();
  shareBtn.classList.remove('is-connect-x', 'is-share', 'is-share-rewarded');
  if (!profile?.x?.connected) {
    shareBtn.classList.add('is-connect-x');
    shareBtn.textContent = 'CONNECT X';
  } else if (profile?.canShareToday) {
    shareBtn.classList.add('is-share-rewarded');
    const gold = profile.goldRewardToday || 20;
    shareBtn.innerHTML = `SHARE +${gold} <span class="icon-atlas pm-share-gold-icon" role="img" aria-label="gold"></span>`;
  } else {
    shareBtn.classList.add('is-share');
    shareBtn.textContent = 'SHARE RESULT';
  }
}
function updatePlayerAvatarVisibility() {
  const btn = DOM.playerAvatarBtn;
  if (!btn) return;
  const snap = getAuthStateSnapshot();
  const walletConnected =
    hasWalletAuthSession() ||
    Boolean(snap?.linkedWallet);
  btn.hidden = !walletConnected;
}
function checkXOAuthCallback() {
  if (typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const xParam = params.get('x');
  if (!xParam) return;
  const newParams = new URLSearchParams(params);
  newParams.delete('x');
  newParams.delete('username');
  newParams.delete('reason');
  const newSearch = newParams.toString();
  const newUrl = newSearch
    ? `${location.pathname}?${newSearch}${location.hash}`
    : `${location.pathname}${location.hash}`;
  try { history.replaceState(null, '', newUrl); } catch (_e) { /* ignore */ }
  if (xParam === 'connected') {
    const username = params.get('username') || '';
    notifySuccess(`✅ X connected${username ? ` as @${username}` : ''}!`);
    invalidateProfileCache();
    if (isPlayerMenuOpen()) {
      refreshPlayerMenu();
    }
  } else if (xParam === 'error') {
    const reason = params.get('reason') || 'unknown';
    notifyError(`❌ X connect failed: ${reason}`);
  }
}
function syncFirstRunOnboardingUiState() {
  if (typeof document === 'undefined') return;
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const isFirstRun = shouldShowFirstRunHint(storage);
  document.body.classList.toggle('onboarding-first-run', isFirstRun);
}
