import { DOM } from '../state.js';
import { fetchMyProfile, disconnectX } from '../api.js';
import { hasAuthenticatedSession, isTelegramAuthMode, linkTelegram, linkWallet, isTelegramMiniApp } from '../auth.js';
import { showPlayerMenuScreen, hidePlayerMenuScreen } from '../screens.js';
import { notifySuccess, notifyError } from '../notifier.js';
import { performShare, startXConnectFlow } from '../share/shareFlow.js';
import { logger } from '../logger.js';

const MAX_STREAK_ICONS = 10;
const LONG_PRESS_DURATION_MS = 600;
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
  const connectBtn = DOM.pmConnectXBtn;
  const connectedEl = DOM.pmXConnected;
  const usernameEl = DOM.pmXUsername;

  if (!connectBtn || !connectedEl) return;

  if (profile?.x?.connected) {
    connectBtn.hidden = true;
    connectedEl.hidden = false;
    if (usernameEl) {
      usernameEl.textContent = `@${profile.x.username || 'X'}`;
    }
  } else {
    connectBtn.hidden = false;
    connectedEl.hidden = true;
  }
}

function updateTelegramBlock(profile) {
  const btn = DOM.pmConnectTelegramBtn;
  if (!btn) return;

  if (profile?.telegram?.connected) {
    btn.textContent = profile.telegram.username ? `@${profile.telegram.username}` : 'Telegram ✓';
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
      await startXConnectFlow({
        onConnected: () => refreshPlayerMenu()
      });
    });
  }

  if (DOM.pmXConnected) {
    bindLongPress(DOM.pmXConnected, () => {
      if (DOM.pmXDisconnectBtn) DOM.pmXDisconnectBtn.hidden = false;
    });
  }

  if (DOM.pmXDisconnectBtn) {
    DOM.pmXDisconnectBtn.addEventListener('click', async () => {
      const { ok } = await disconnectX();
      if (ok) {
        notifySuccess('✅ X disconnected.');
        if (DOM.pmXConnected) DOM.pmXConnected.classList.remove('show-disconnect');
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

export { initPlayerMenu, openPlayerMenu, closePlayerMenu, refreshPlayerMenu, isPlayerMenuOpen };
