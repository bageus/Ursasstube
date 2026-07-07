import { trackAnalyticsEvent } from './analytics.js';

const LEADERBOARD_BUTTON_ID = 'leaderboardBtn';
const LEADERBOARD_SCREEN_ID = 'leaderboardScreen';
const LEADERBOARD_BACK_ID = 'leaderboardBackBtn';
const LEADERBOARD_LIST_ID = 'leaderboardList';
const STYLE_ID = 'leaderboardOverlayStyles';

let installed = false;

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
      align-items: center;
      justify-content: center;
      padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
      background: radial-gradient(circle at 50% 18%, rgba(168, 85, 247, 0.28) 0%, rgba(10, 8, 22, 0.96) 52%, rgba(3, 6, 18, 0.98) 100%);
      backdrop-filter: blur(10px);
      box-sizing: border-box;
      overflow: auto;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-panel {
      width: min(540px, 100%);
      max-height: min(720px, 92vh);
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px;
      border: 1px solid rgba(192, 132, 252, 0.36);
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(17, 12, 35, 0.96), rgba(9, 11, 26, 0.96));
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.46);
      box-sizing: border-box;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Orbitron', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-subtitle {
      margin: 0;
      color: rgba(255, 255, 255, 0.72);
      font-size: 13px;
      line-height: 1.35;
      text-align: center;
    }
    #${LEADERBOARD_SCREEN_ID} .lb { width: 100%; max-width: none; margin: 0; }
    #${LEADERBOARD_SCREEN_ID} .lb-list {
      max-height: min(54vh, 430px);
      overflow: auto;
      padding-right: 4px;
    }
    body.leaderboard-overlay-open { overflow: hidden; }
    @media (max-width: 520px) {
      #${LEADERBOARD_SCREEN_ID} { align-items: stretch; padding-inline: 12px; }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-panel { max-height: 94vh; padding: 14px; }
      #${LEADERBOARD_SCREEN_ID} .leaderboard-overlay-title { font-size: 18px; }
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

  const panel = document.createElement('div');
  panel.className = 'leaderboard-overlay-panel';

  const head = document.createElement('div');
  head.className = 'leaderboard-overlay-head';

  const back = document.createElement('button');
  back.id = LEADERBOARD_BACK_ID;
  back.type = 'button';
  back.className = 'app-nav-btn app-back-btn ui-btn ui-btn--icon ui-btn--ghost';
  back.setAttribute('aria-label', 'Back to menu');
  back.textContent = '←';

  head.append(back, createLeaderboardTitle());

  const subtitle = document.createElement('p');
  subtitle.className = 'leaderboard-overlay-subtitle';
  subtitle.textContent = 'Leaderboard loads separately from Start Game.';

  const lb = document.createElement('div');
  lb.className = 'lb leaderboard-overlay-lb';

  const list = document.createElement('div');
  list.id = LEADERBOARD_LIST_ID;
  list.className = 'lb-list';
  for (let index = 0; index < 5; index += 1) list.append(createSkeletonRow());

  lb.append(list);
  panel.append(head, subtitle, lb);
  screen.append(panel);
  document.body?.append(screen);
  return screen;
}

function openLeaderboardOverlay() {
  const screen = ensureLeaderboardScreen();
  if (!screen) return;
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

  if (typeof window !== 'undefined') {
    window.__URSASS_LEADERBOARD_OVERLAY__ = {
      open: openLeaderboardOverlay,
      close: closeLeaderboardOverlay,
    };
  }
}

export { installLeaderboardOverlay };
