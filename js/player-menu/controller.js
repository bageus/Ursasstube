import { DOM } from '../state.js';
import { fetchMyProfile, disconnectX, setNickname, setLeaderboardDisplay } from '../api.js';
import { hasAuthenticatedSession, linkTelegram, linkWallet } from '../auth.js';
import { showPlayerMenuScreen, hidePlayerMenuScreen } from '../screens.js';
import { notifySuccess, notifyError, notifyWarn } from '../notifier.js';
import { performShare, startXConnectFlow } from '../share/shareFlow.js';

const MAX_STREAK_ICONS = 10;
const LONG_PRESS_DURATION_MS = 600;
let menuOpen = false;
let currentProfile = null;
let longPressTimer = null;
let eventsInitialized = false;

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
    btn.innerHTML = `SHARE +${gold} <img src="img/icon_gold.png" alt="gold" class="pm-share-gold-icon">`;
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

  const showWallet = profile?.telegram?.connected && !profile?.wallet?.connected;
  btn.hidden = !showWallet;
}

function fillProfileData(profile) {
  currentProfile = profile;

  if (DOM.pmRankNumber) {
    DOM.pmRankNumber.textContent = profile?.rank ? `#${profile.rank}` : '#—';
  }
  if (DOM.pmBestScore) {
    DOM.pmBestScore.textContent = profile?.bestScore ?? 0;
  }
  if (DOM.pmReferralLink) {
    DOM.pmReferralLink.value = profile?.referralUrl || '';
  }
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
  const profile = await fetchMyProfile();
  if (profile) {
    fillProfileData(profile);
  }
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

  if (DOM.pmBackBtn) {
    DOM.pmBackBtn.addEventListener('click', () => closePlayerMenu());
  }

  if (DOM.pmCopyRefBtn) {
    DOM.pmCopyRefBtn.addEventListener('click', () => {
      const val = DOM.pmReferralLink ? DOM.pmReferralLink.value : '';
      if (!val) return;
      navigator.clipboard?.writeText(val).then(() => {
        notifySuccess('✅ Referral link copied!');
      }).catch(() => {
        try {
          if (DOM.pmReferralLink) {
            DOM.pmReferralLink.select();
            document.execCommand('copy');
          }
          notifySuccess('✅ Referral link copied!');
        } catch (_e) {
          notifyError('⚠️ Could not copy. Please copy manually.');
        }
      });
    });
  }

  if (DOM.pmShareBtn) {
    DOM.pmShareBtn.addEventListener('click', async () => {
      if (!currentProfile) return;

      if (!currentProfile.x?.connected) {
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
  if (DOM.pmReferralLink) DOM.pmReferralLink.value = '';

  // Instant fallback from the main wallet header (already loaded via leaderboard)
  const headerRank = DOM.walletRank?.textContent?.trim();
  if (headerRank && headerRank !== '—' && DOM.pmRankNumber) {
    DOM.pmRankNumber.textContent = headerRank.startsWith('#') ? headerRank : `#${headerRank}`;
  }
  const headerBest = DOM.walletBest?.textContent?.trim();
  if (headerBest && headerBest !== '—' && headerBest !== '0' && DOM.pmBestScore) {
    DOM.pmBestScore.textContent = headerBest;
  }

  await loadProfile();
}

function closePlayerMenu() {
  menuOpen = false;
  hidePlayerMenuScreen();
}

async function refreshPlayerMenu() {
  if (!menuOpen) return;
  await loadProfile();
}

function isPlayerMenuOpen() {
  return menuOpen;
}

export { initPlayerMenu, openPlayerMenu, refreshPlayerMenu, isPlayerMenuOpen };
