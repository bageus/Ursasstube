import { trackAnalyticsEvent } from './analytics.js';

const LEADERBOARD_BUTTON_ID = 'leaderboardBtn';
const LEADERBOARD_SCREEN_ID = 'leaderboardScreen';
const LEADERBOARD_BACK_ID = 'leaderboardBackBtn';
const LEADERBOARD_LIST_ID = 'leaderboardList';
const STYLE_ID = 'leaderboardOverlayStyles';

let installed = false;
let leaderboardObserver = null;

function createSkeletonRow() {
  const row = document.createElement('div');
  row.className = 'skeleton-row';

  const rank = document.createElement('div');
  rank.className = 'skeleton-block skeleton-rank';

  const wallet = document.createElement('div');
  wallet.className = 'skeleton-block skeleton-wallet';

  const score = document.createElement('div');
  score.className = 'skeleton-block skeleton-score';

  row.append(rank, wallet, score);
  return row;
}

function createAudioIcon(iconClass) {
  const icon = document.createElement('span');
  icon.className = `icon-atlas audio-toggle-icon ${iconClass}`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createFixedNavButton({ id, action, title, text, iconClass }) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = 'store-nav-btn app-nav-btn ui-btn ui-btn--icon ui-btn--ghost';
  button.title = title;
  button.setAttribute('aria-label', title);

  if (action) {
    button.dataset.action = action;
    button.classList.add('app-audio-btn');
  } else {
    button.classList.add('app-back-btn');
  }

  if (iconClass) button.append(createAudioIcon(iconClass));
  else button.textContent = text;

  return button;
}

function createLeaderboardFixedNav() {
  const nav = document.createElement('div');
  nav.className = 'leaderboard-fixed-nav app-fixed-nav';

  nav.append(
    createFixedNavButton({
      id: 'leaderboardSfxBtn',
      action: 'toggle-sfx',
      title: 'Sound Effects',
      iconClass: 'icon-sfx-on',
    }),
    createFixedNavButton({
      id: 'leaderboardMusicBtn',
      action: 'toggle-music',
      title: 'Music',
      iconClass: 'icon-music-on',
    }),
    createFixedNavButton({
      id: LEADERBOARD_BACK_ID,
      title: 'Back',
      text: '←',
    })
  );

  return nav;
}

function injectLeaderboardOverlayStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #startLeaderboardWrap { display: none !important; }
    #${LEADERBOARD_BUTTON_ID} { min-width: 230px; margin-top: 10px; }
    #${LEADERBOARD_SCREEN_ID}[hidden] { display: none !important; }
    #${LEADERBOARD_SCREEN_ID} {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 80px 20px 40px 64px;
      background: rgba(5, 3, 11, .97);
      box-sizing: border-box;
      overflow-y: auto;
      overflow-x: hidden;
    }
    body.telegram-runtime.leaderboard-overlay-open #playerCorner,
    body.telegram-runtime.leaderboard-overlay-open #walletCorner,
    body.telegram-mini-app.leaderboard-overlay-open #playerCorner,
    body.telegram-mini-app.leaderboard-overlay-open #walletCorner {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-fixed-nav {
      position: fixed;
      left: 14px;
      top: 24px;
      z-index: 1210;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-panel {
      width: min(100%, 500px);
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 0 0 30px;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      box-sizing: border-box;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-head {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      width: 100%;
      text-align: center;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-title {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-width: 0;
      font-family: 'Orbitron', sans-serif;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-align: center;
      text-transform: uppercase;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-title-text {
      background: var(--grad);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: transparent;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-title .icon-atlas {
      -webkit-text-fill-color: initial;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-lb {
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 20px 20px 18px;
      box-sizing: border-box;
    }
    #${LEADERBOARD_SCREEN_ID} .lb-list {
      max-height: none;
      overflow: visible;
      padding: 0;
    }
    body.leaderboard-overlay-open { overflow: hidden; }
    @media (max-width: 768px) {
      #${LEADERBOARD_SCREEN_ID} {
        padding: 80px 15px 36px 52px;
      }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-fixed-nav {
        left: 8px;
        top: max(12px, env(safe-area-inset-top));
        gap: 8px;
      }
    }
    @media (max-width: 520px) {
      #${LEADERBOARD_SCREEN_ID} {
        padding: 74px 12px 32px 46px;
      }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-panel {
        gap: 14px;
      }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-title {
        font-size: 22px;
        letter-spacing: 0.06em;
      }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-lb {
        padding: 16px 14px 14px;
      }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-fixed-nav {
        left: 6px;
        top: max(10px, env(safe-area-inset-top));
        gap: 6px;
      }
    }
  `;
  document.head?.append(style);
}

function ensureLeaderboardButton() {
  let button = document.getElementById(LEADERBOARD_BUTTON_ID);
  if (button) return button;

  const host = document.querySelector('.new-buttons');
  const startWrap = document.querySelector('.start-btn-wrap');
  if (!host || !startWrap) return null;

  button = document.createElement('button');
  button.id = LEADERBOARD_BUTTON_ID;
  button.type = 'button';
  button.className = 'btn-new btn-new-secondary ui-btn ui-btn--secondary ui-btn--lg';
  button.textContent = 'LEADERBOARD';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', LEADERBOARD_SCREEN_ID);

  startWrap.after(button);
  return button;
}

function createLeaderboardTitle() {
  const title = document.createElement('div');
  title.id = 'leaderboardOverlayTitle';
  title.className = 'leaderboard-overlay-title';

  const icon = document.createElement('span');
  icon.className = 'icon-atlas';
  icon.style.width = '32px';
  icon.style.height = '32px';
  icon.style.backgroundSize = '160px auto';
  icon.style.backgroundPosition = '-32px 0px';

  const text = document.createElement('span');
  text.className = 'leaderboard-overlay-title-text';
  text.textContent = 'Top players';

  title.append(icon, text);
  return title;
}

function ensureLeaderboardScreen() {
  let screen = document.getElementById(LEADERBOARD_SCREEN_ID);
  if (screen) return screen;

  screen = document.createElement('div');
  screen.id = LEADERBOARD_SCREEN_ID;
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'leaderboardOverlayTitle');

  const fixedNav = createLeaderboardFixedNav();

  const panel = document.createElement('div');
  panel.className = 'leaderboard-overlay-panel';

  const head = document.createElement('div');
  head.className = 'leaderboard-overlay-head';
  head.append(createLeaderboardTitle());

  const lb = document.createElement('div');
  lb.className = 'lb leaderboard-overlay-lb';

  const list = document.createElement('div');
  list.id = LEADERBOARD_LIST_ID;
  list.className = 'lb-list';
  for (let index = 0; index < 5; index += 1) list.append(createSkeletonRow());

  lb.append(list);
  panel.append(head, lb);
  screen.append(fixedNav, panel);
  document.body?.append(screen);
  return screen;
}

function mirrorStartLeaderboardToOverlay() {
  const source = document.getElementById('startLeaderboardList');
  const target = document.getElementById(LEADERBOARD_LIST_ID);
  if (!source || !target || source === target || source.children.length === 0) return;

  target.replaceChildren(...Array.from(source.children).map((node) => node.cloneNode(true)));
}

function observeLeaderboardSource() {
  if (leaderboardObserver || typeof MutationObserver === 'undefined') return;
  const source = document.getElementById('startLeaderboardList');
  if (!source) return;

  leaderboardObserver = new MutationObserver(() => mirrorStartLeaderboardToOverlay());
  leaderboardObserver.observe(source, { childList: true, subtree: true });
  mirrorStartLeaderboardToOverlay();
}

function openLeaderboardOverlay() {
  const screen = ensureLeaderboardScreen();
  if (!screen) return;
  mirrorStartLeaderboardToOverlay();
  screen.hidden = false;
  screen.classList.add('visible');
  document.body?.classList.add('leaderboard-overlay-open');
  document.getElementById(LEADERBOARD_BACK_ID)?.focus?.();
  trackAnalyticsEvent('leaderboard_opened', { source: 'menu_button' });
}

function closeLeaderboardOverlay() {
  const screen = document.getElementById(LEADERBOARD_SCREEN_ID);
  if (!screen) return;
  screen.classList.remove('visible');
  screen.hidden = true;
  document.body?.classList.remove('leaderboard-overlay-open');
  document.getElementById(LEADERBOARD_BUTTON_ID)?.focus?.();
}

function bindLeaderboardOverlayEvents() {
  const button = ensureLeaderboardButton();
  const screen = ensureLeaderboardScreen();
  const back = document.getElementById(LEADERBOARD_BACK_ID);

  button?.addEventListener('click', openLeaderboardOverlay);
  back?.addEventListener('click', closeLeaderboardOverlay);
  screen?.addEventListener('click', (event) => {
    if (event.target === screen) closeLeaderboardOverlay();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLeaderboardOverlay();
  });
}

function installLeaderboardOverlay() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  injectLeaderboardOverlayStyles();
  bindLeaderboardOverlayEvents();
  observeLeaderboardSource();

  if (typeof window !== 'undefined') {
    window.__URSASS_LEADERBOARD_OVERLAY__ = {
      open: openLeaderboardOverlay,
      close: closeLeaderboardOverlay,
    };
  }
}

export { installLeaderboardOverlay };
