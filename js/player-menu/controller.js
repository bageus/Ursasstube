import { DOM } from '../state.js';
import { fetchMyProfile, fetchCoinHistory, disconnectX, setNickname, setLeaderboardDisplay, applyReferralCode, refreshPlayerStats } from '../api.js';
import { hasAuthenticatedSession, linkTelegram, linkWallet } from '../features/auth/index.js';
import { isTelegramAuthMode } from '../auth-state.js';
import { showPlayerMenuScreen, hidePlayerMenuScreen } from '../screens.js';
import { notifySuccess, notifyError, notifyWarn } from '../notifier.js';
import { performShare, startXConnectFlow } from '../share/shareFlow.js';
import { analytics } from '../analytics-events.js';
import { normalizeReferralCode, readReferralCodeFromLocation, readReferralCodeFromTelegram } from '../referral/referralCode.js';
import { postOnboardingAction } from '../features/onboarding/index.js';

const MAX_STREAK_ICONS = 10;
const LONG_PRESS_DURATION_MS = 600;
let menuOpen = false;
let currentProfile = null;
let longPressTimer = null;
let eventsInitialized = false;
let referralPrefill = '';

function resolveWebReferralUrl(profile) {
  const code = profile?.referralCode || '';
  return profile?.webReferralUrl || (code ? `${window.location.origin}/?ref_hint=${encodeURIComponent(code)}` : '');
}

function setReferralMessage(el, message) { if (!el) return; el.hidden = !message; el.textContent = message || ''; }
function resolveReferralApplyErrorMessage(data) {
  const errorCode = String(data?.error || data?.code || '').toLowerCase();
  switch (errorCode) {
    case 'cannot_use_own_referral_code':
      return 'You cannot use your own referral code.';
    case 'referral_code_not_found':
      return 'Referral code not found.';
    case 'referral_already_applied':
      return 'Referral code already applied.';
    case 'reward_credit_failed':
      return 'Referral code applied, but reward credit failed. Please try again later.';
    default:
      return data?.message || data?.error || 'Could not apply referral code.';
  }
}

function toRewardAmount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : null;
}

function buildReferralSuccessMessage(data) {
  const rewardUser = toRewardAmount(
    data?.rewardUserGold ?? data?.playerRewardGold ?? data?.appliedRewardGold ?? data?.reward?.userGold
  );
  const rewardReferrer = toRewardAmount(
    data?.rewardReferrerGold ?? data?.referrerRewardGold ?? data?.reward?.referrerGold
  );
  const totalGold = toRewardAmount(data?.totalGold ?? data?.updatedTotalGold ?? data?.wallet?.totalGoldCoins);

  const hasConfirmedRewards = rewardUser !== null || rewardReferrer !== null || totalGold !== null;
  if (!hasConfirmedRewards) return 'Referral code applied. Rewards are being updated.';

  if (rewardUser !== null && rewardReferrer !== null) {
    return `+${rewardUser} gold for you. Referrer received +${rewardReferrer} gold.`;
  }
  if (rewardUser !== null) {
    return `Referral reward confirmed: +${rewardUser} gold.`;
  }
  if (totalGold !== null) {
    return `Referral code applied. Total gold updated: ${totalGold.toLocaleString('en-US')}.`;
  }
  return 'Referral code applied. Rewards are being updated.';
}
const COIN_HISTORY_TYPE_LABELS = {
  share: 'Share result',
  share_reward: 'Share result',
  ride: 'Ride',
  buy: 'Purchase reward',
  purchase_reward: 'Purchase reward',
  referral: 'Referral bonus',
  referral_bonus: 'Referral bonus',
  refer: 'Friend joined',
  onboarding_bonus: 'Onboarding bonus',
  onboarding: 'Onboarding bonus',
  task: 'Task'
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function toPositiveNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.abs(Math.trunc(num)));
}

function pickCoinAmount(entry, keys = []) {
  for (const key of keys) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, key)) {
      return toPositiveNumber(entry[key]);
    }
  }
  return 0;
}

function resolveEntryCoins(entry) {
  const gold = pickCoinAmount(entry, [
    'gold',
    'goldCoins',
    'goldDelta',
    'goldReward',
    'goldAmount',
    'coinsGold'
  ]);
  const silver = pickCoinAmount(entry, [
    'silver',
    'silverCoins',
    'silverDelta',
    'silverReward',
    'silverAmount',
    'coinsSilver'
  ]);

  if (gold || silver) return { gold, silver };

  const amount = pickCoinAmount(entry, ['amount', 'value']);
  const currency = String(entry?.currency || entry?.coin || entry?.coinType || '').toLowerCase();
  if (currency === 'gold') return { gold: amount, silver: 0 };
  if (currency === 'silver') return { gold: 0, silver: amount };

  return { gold: 0, silver: 0 };
}

function renderCoinHistory(history, options = {}) {
  const tbody = DOM.pmHistoryBody;
  if (!tbody) return;

  const { loadFailed = false } = options;
  const rows = Array.isArray(history) ? history : [];
  if (!rows.length) {
    const emptyMessage = loadFailed ? 'Could not load history' : 'No rewards yet';
    tbody.innerHTML = `<tr><td colspan="3" class="pm-history-empty">${emptyMessage}</td></tr>`;
    return;
  }

  const html = rows.map((entry) => {
    const typeKey = String(entry?.type || entry?.rewardType || '').toLowerCase();
    const typeLabel = COIN_HISTORY_TYPE_LABELS[typeKey] || typeKey || 'Unknown';
    const { gold, silver } = resolveEntryCoins(entry);
    return `<tr><td>${escapeHtml(typeLabel)}</td><td>${gold.toLocaleString('en-US')}</td><td>${silver.toLocaleString('en-US')}</td></tr>`;
  }).join('');
  tbody.innerHTML = html;
}

function updateShareButtonState(profile) {
  const btn = DOM.pmShareBtn;
  if (!btn) return;

  btn.classList.remove('is-connect-x', 'is-share', 'is-share-rewarded');
  btn.disabled = false;

  if (!profile?.x?.connected) {
    btn.classList.add('is-connect-x');
    btn.innerHTML = 'CONNECT X';
    btn.disabled = false;
    return;
  }

  if (profile.canShareToday) {
    btn.classList.add('is-share-rewarded');
    const gold = profile.goldRewardToday || 20;
    btn.innerHTML = `SHARE +${gold} <span class="icon-atlas pm-share-gold-icon" role="img" aria-label="gold"></span>`;
  } else {
    btn.classList.add('is-share');
    btn.innerHTML = 'SHARE RESULT';
  }
}

function updateStreakDisplay(profile) {
  const streakEl = DOM.pmStreak;
  const iconsEl = DOM.pmStreakIcons;
  if (!streakEl || !iconsEl) return;

  const streak = Number(profile?.shareStreak || 0);
  if (streak > 0) {
    streakEl.hidden = false;
    iconsEl.textContent = '🔥'.repeat(Math.min(streak, MAX_STREAK_ICONS));
  } else {
    streakEl.hidden = true;
    iconsEl.textContent = '';
  }
}

function updateXBlock(profile) {
  const btn = DOM.pmConnectXBtn;
  const disconnectBtn = DOM.pmXDisconnectBtn;
  if (!btn) return;

  if (profile?.x?.connected) {
    btn.textContent = `@${profile.x.username || 'X'}`;
    btn.classList.add('pm-side-btn--connected');
    btn.dataset.state = 'connected';
  } else {
    btn.textContent = 'Connect X';
    btn.classList.remove('pm-side-btn--connected');
    btn.dataset.state = 'disconnected';
    if (disconnectBtn) disconnectBtn.hidden = true;
  }
}

function updateTelegramBlock(profile) {
  const btn = DOM.pmConnectTelegramBtn;
  if (!btn) return;

  if (isTelegramAuthMode()) {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;

  if (profile?.telegram?.connected) {
    const tgUsername = profile.telegram.username;
    const tgId = profile.telegram.id;
    btn.textContent = tgUsername
      ? `@${tgUsername}`
      : (tgId ? `Telegram #${tgId}` : 'Telegram ✓');
    btn.disabled = true;
    btn.classList.add('pm-side-btn--connected');
  } else {
    btn.textContent = 'Connect Telegram';
    btn.disabled = false;
    btn.classList.remove('pm-side-btn--connected');
  }
}

function updateWalletBlock(profile) {
  const btn = DOM.pmConnectWalletBtn;
  if (!btn) return;

  const showWallet = isTelegramAuthMode() || (profile?.telegram?.connected && !profile?.wallet?.connected);
  btn.hidden = !showWallet;
  if (showWallet) {
    btn.textContent = profile?.wallet?.connected ? 'Wallet connected' : 'Connect Wallet';
    btn.disabled = !!profile?.wallet?.connected;
    btn.classList.toggle('pm-side-btn--connected', !!profile?.wallet?.connected);
  } else {
    btn.disabled = false;
    btn.classList.remove('pm-side-btn--connected');
  }
}


function applyResponsivePlayerMenuLayout() {
  const xBlock = DOM.pmXBlock;
  if (!xBlock) return;
  xBlock.classList.add('pm-x-wrap--mobile-inline');
}

function fillProfileData(profile) {
  currentProfile = profile;

  if (DOM.pmRankNumber) {
    DOM.pmRankNumber.textContent = profile?.rank ? `#${profile.rank}` : '#—';
  }
  if (DOM.pmBestScore) {
    DOM.pmBestScore.textContent = profile?.bestScore ?? 0;
  }
  if (DOM.pmReferralCode) {
    DOM.pmReferralCode.value = profile?.referralCode || '';
  }
  const hasApplied = Boolean(profile?.hasAppliedReferralCode);
  const appliedCode = profile?.appliedReferralCode || '';
  if (DOM.pmTelegramReferralRow) DOM.pmTelegramReferralRow.hidden = !profile?.telegramReferralUrl;
  if (DOM.pmReferralApplyInput) {
    if (!hasApplied && referralPrefill && !DOM.pmReferralApplyInput.value) DOM.pmReferralApplyInput.value = referralPrefill;
    DOM.pmReferralApplyInput.disabled = hasApplied;
  }
  if (DOM.pmReferralApplyBtn) DOM.pmReferralApplyBtn.disabled = hasApplied;
  setReferralMessage(DOM.pmReferralAppliedState, hasApplied ? `Referral code applied: ${appliedCode}` : '');
  if (DOM.pmReferralCount) {
    DOM.pmReferralCount.textContent = Number(profile?.referralCount || 0);
  }

  // Nickname and leaderboard display mode
  if (DOM.pmNicknameInput) {
    DOM.pmNicknameInput.value = profile?.nickname || '';
  }
  if (DOM.pmDisplaySelect) {
    DOM.pmDisplaySelect.value = profile?.leaderboardDisplay || 'wallet';
    const nicknameOpt = DOM.pmDisplaySelect.querySelector('option[value="nickname"]');
    const walletOpt = DOM.pmDisplaySelect.querySelector('option[value="wallet"]');
    const telegramOpt = DOM.pmDisplaySelect.querySelector('option[value="telegram"]');
    if (nicknameOpt) {
      nicknameOpt.disabled = !profile?.nickname;
      nicknameOpt.textContent = profile?.nickname ? 'Nickname' : 'Nickname (set nickname first)';
    }
    if (walletOpt) walletOpt.disabled = !profile?.wallet?.connected;
    if (telegramOpt) telegramOpt.disabled = !profile?.telegram?.connected;
  }

  updateStreakDisplay(profile);
  updateXBlock(profile);
  updateTelegramBlock(profile);
  updateWalletBlock(profile);
  updateShareButtonState(profile);
}

async function loadProfile() {
  console.info('Player menu history nodes', {
    historySection: document.querySelector('.pm-history'),
    body: document.getElementById('pmHistoryBody')
  });

  const [profileResult, coinHistoryResult] = await Promise.allSettled([
    fetchMyProfile(),
    fetchCoinHistory(50)
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const coinHistory = coinHistoryResult.status === 'fulfilled' ? coinHistoryResult.value : [];
  const coinHistoryLoadFailed = coinHistoryResult.status === 'rejected';

  if (profile) {
    fillProfileData(profile);
  }
  renderCoinHistory(coinHistory, { loadFailed: coinHistoryLoadFailed });
  applyResponsivePlayerMenuLayout();
  // If profile is null (e.g. 401), keep any fallback values already shown
  return profile;
}

function bindLongPress(element, callback) {
  if (!element) return;

  element.addEventListener('pointerdown', () => {
    longPressTimer = setTimeout(() => {
      element.classList.add('show-disconnect');
      callback();
    }, LONG_PRESS_DURATION_MS);
  });

  const cancel = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  element.addEventListener('pointerup', cancel);
  element.addEventListener('pointerleave', cancel);
  element.addEventListener('pointercancel', cancel);
}

function initPlayerMenuEvents() {
  if (eventsInitialized) return;
  eventsInitialized = true;

  applyResponsivePlayerMenuLayout();

  if (DOM.pmBackBtn) {
    DOM.pmBackBtn.addEventListener('click', () => closePlayerMenu());
  }

  if (DOM.pmCopyReferralCodeBtn) { DOM.pmCopyReferralCodeBtn.addEventListener('click', async () => { const val = DOM.pmReferralCode?.value || ''; if (!val) return; await navigator.clipboard?.writeText(val); analytics.referralCodeCopied?.(); notifySuccess('Code copied'); }); }
  if (DOM.pmCopyWebReferralBtn) { DOM.pmCopyWebReferralBtn.addEventListener('click', async () => { const val = resolveWebReferralUrl(currentProfile); if (!val) return; await navigator.clipboard?.writeText(val); analytics.referralWebLinkCopied?.(); notifySuccess('Web link copied'); }); }
  if (DOM.pmCopyTelegramReferralBtn) { DOM.pmCopyTelegramReferralBtn.addEventListener('click', async () => { const val = currentProfile?.telegramReferralUrl || ''; if (!val) return; await navigator.clipboard?.writeText(val); analytics.referralTelegramLinkCopied?.(); notifySuccess('Telegram link copied'); }); }
  if (DOM.pmReferralApplyInput) { DOM.pmReferralApplyInput.addEventListener('input', () => { const raw = DOM.pmReferralApplyInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0,64); DOM.pmReferralApplyInput.value = raw; setReferralMessage(DOM.pmReferralError, ''); }); }
  if (DOM.pmReferralApplyBtn) { DOM.pmReferralApplyBtn.addEventListener('click', async () => { if (currentProfile?.hasAppliedReferralCode) return; analytics.referralCodeApplyClicked?.(); const code = normalizeReferralCode(DOM.pmReferralApplyInput?.value || ''); if (!code) { setReferralMessage(DOM.pmReferralError, 'Please enter a valid code (A-Z, 0-9, _, -).'); return; } const ownCode = normalizeReferralCode(currentProfile?.referralCode || ''); if (code === ownCode) { setReferralMessage(DOM.pmReferralError, 'You cannot use your own referral code.'); return; } DOM.pmReferralApplyBtn.disabled = true; const { ok, data } = await applyReferralCode(code); if (ok) { analytics.referralCodeApplySuccess?.(); setReferralMessage(DOM.pmReferralError, ''); setReferralMessage(DOM.pmReferralHint, ''); const optimisticGold = toRewardAmount(data?.totalGold ?? data?.updatedTotalGold ?? data?.gold ?? data?.wallet?.totalGoldCoins); if (optimisticGold !== null && DOM.walletGold) DOM.walletGold.textContent = optimisticGold.toLocaleString('en-US'); notifySuccess(buildReferralSuccessMessage(data)); await Promise.all([refreshPlayerStats(), refreshPlayerMenu(), refreshCoinHistory()]); } else { analytics.referralCodeApplyError?.(); setReferralMessage(DOM.pmReferralError, resolveReferralApplyErrorMessage(data)); DOM.pmReferralApplyBtn.disabled = false; } }); }

  if (DOM.pmShareBtn) {
    DOM.pmShareBtn.addEventListener('click', async () => {
      if (!currentProfile) return;

      if (!currentProfile.x?.connected) {
        await postOnboardingAction({
          action: 'complete',
          key: 'share_result_player_menu',
          screen: 'player-menu',
          target: 'player_menu_connect_x'
        }).catch(() => {});
        await startXConnectFlow({
          onConnected: () => refreshPlayerMenu()
        });
        return;
      }

      await performShare({
        context: 'menu',
        profile: currentProfile,
        onProfileUpdated: () => refreshPlayerMenu()
      });
    });
  }

  if (DOM.pmConnectTelegramBtn) {
    DOM.pmConnectTelegramBtn.addEventListener('click', () => {
      if (isTelegramAuthMode()) return;
      if (!currentProfile?.telegram?.connected) {
        linkTelegram();
      }
    });
  }

  if (DOM.pmConnectXBtn) {
    DOM.pmConnectXBtn.addEventListener('click', async () => {
      if (DOM.pmConnectXBtn.dataset.state === 'connected') return;
      await startXConnectFlow({
        onConnected: () => refreshPlayerMenu()
      });
    });

    // Desktop hover: show disconnect when connected
    const xWrap = DOM.pmConnectXBtn.closest?.('.pm-x-wrap') || DOM.pmConnectXBtn.parentElement;
    if (xWrap) {
      xWrap.addEventListener('mouseenter', () => {
        if (DOM.pmConnectXBtn.dataset.state === 'connected' && DOM.pmXDisconnectBtn) {
          DOM.pmXDisconnectBtn.hidden = false;
        }
      });
      xWrap.addEventListener('mouseleave', () => {
        if (DOM.pmXDisconnectBtn) DOM.pmXDisconnectBtn.hidden = true;
      });
    }

    // Mobile long-press: show disconnect when connected
    bindLongPress(DOM.pmConnectXBtn, () => {
      if (DOM.pmConnectXBtn.dataset.state === 'connected' && DOM.pmXDisconnectBtn) {
        DOM.pmXDisconnectBtn.hidden = false;
      }
    });
  }

  if (DOM.pmXDisconnectBtn) {
    DOM.pmXDisconnectBtn.addEventListener('click', async () => {
      const { ok } = await disconnectX();
      if (ok) {
        notifySuccess('✅ X disconnected.');
        if (DOM.pmXDisconnectBtn) DOM.pmXDisconnectBtn.hidden = true;
        await refreshPlayerMenu();
      } else {
        notifyError('⚠️ Could not disconnect X. Try again.');
      }
    });
  }

  if (DOM.pmConnectWalletBtn) {
    DOM.pmConnectWalletBtn.addEventListener('click', () => {
      linkWallet();
    });
  }

  if (DOM.pmNicknameSaveBtn) {
    DOM.pmNicknameSaveBtn.addEventListener('click', async () => {
      const input = DOM.pmNicknameInput;
      if (!input) return;
      const nickname = input.value.trim();
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(nickname)) {
        notifyError('Nickname must be 3-16 chars: a-z, A-Z, 0-9, _');
        return;
      }
      DOM.pmNicknameSaveBtn.disabled = true;
      try {
        const { ok, status } = await setNickname(nickname);
        if (ok) {
          notifySuccess('✅ Nickname saved');
          if (currentProfile) currentProfile.nickname = nickname;
          await refreshPlayerMenu();
        } else if (status === 404) {
          notifyWarn('⚠️ Nickname feature is being deployed. Try again in a few minutes.');
        } else if (status === 409) {
          notifyError('Nickname is taken');
        } else {
          notifyError('⚠️ Could not save nickname. Try again.');
        }
      } catch (_e) {
        notifyError('⚠️ Could not save nickname. Try again.');
      } finally {
        if (DOM.pmNicknameSaveBtn) DOM.pmNicknameSaveBtn.disabled = false;
      }
    });
  }

  if (DOM.pmDisplaySelect) {
    DOM.pmDisplaySelect.addEventListener('change', async () => {
      const mode = DOM.pmDisplaySelect.value;
      try {
        const { ok, status } = await setLeaderboardDisplay(mode);
        if (ok) {
          notifySuccess('✅ Display updated');
          if (currentProfile) currentProfile.leaderboardDisplay = mode;
        } else if (status === 404) {
          notifyWarn('⚠️ Display mode feature is being deployed. Try again in a few minutes.');
        } else {
          notifyError('⚠️ Could not update display mode. Try again.');
        }
      } catch (_e) {
        notifyError('⚠️ Could not update display mode. Try again.');
      }
    });
  }
}

function initPlayerMenu() {
  initPlayerMenuEvents();
}

async function openPlayerMenu() {
  if (!hasAuthenticatedSession()) return;

  menuOpen = true;
  showPlayerMenuScreen();

  if (DOM.pmRankNumber) DOM.pmRankNumber.textContent = '#—';
  if (DOM.pmBestScore) DOM.pmBestScore.textContent = '0';
  if (DOM.pmReferralCode) DOM.pmReferralCode.value = '';
  referralPrefill = readReferralCodeFromLocation(location.search) || readReferralCodeFromTelegram() || '';
  if (DOM.pmReferralApplyInput && referralPrefill) { DOM.pmReferralApplyInput.value = referralPrefill; setReferralMessage(DOM.pmReferralHint, 'Referral code detected. Tap Apply to claim your reward.'); } else { setReferralMessage(DOM.pmReferralHint, ''); }

  // Instant fallback from the main wallet header (already loaded via leaderboard)
  const headerRank = DOM.walletRank?.textContent?.trim();
  if (headerRank && headerRank !== '—' && DOM.pmRankNumber) {
    DOM.pmRankNumber.textContent = headerRank.startsWith('#') ? headerRank : `#${headerRank}`;
  }
  const headerBest = DOM.walletBest?.textContent?.trim();
  if (headerBest && headerBest !== '—' && headerBest !== '0' && DOM.pmBestScore) {
    DOM.pmBestScore.textContent = headerBest;
  }

  applyResponsivePlayerMenuLayout();
  await loadProfile();
}

async function refreshCoinHistory() {
  if (!menuOpen) return;
  const coinHistory = await fetchCoinHistory(50);
  renderCoinHistory(coinHistory);
}

function closePlayerMenu() {
  menuOpen = false;
  hidePlayerMenuScreen();
  refreshPlayerStats().catch(() => {});
}

async function refreshPlayerMenu() {
  if (!menuOpen) return;
  applyResponsivePlayerMenuLayout();
  await loadProfile();
}

function isPlayerMenuOpen() {
  return menuOpen;
}

export { initPlayerMenu, openPlayerMenu, refreshPlayerMenu, isPlayerMenuOpen };
