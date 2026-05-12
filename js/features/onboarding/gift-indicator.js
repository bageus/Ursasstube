import { formatRemainingHours } from './boost-timer.js';

const GIFT_INDICATOR_ID = 'onboardingGiftIndicator';

function ensureStyles() {
  if (document.getElementById('onboardingGiftIndicatorStyles')) return;
  const style = document.createElement('style');
  style.id = 'onboardingGiftIndicatorStyles';
  style.textContent = `
    #${GIFT_INDICATOR_ID}{position:fixed;top:150px;right:20px;z-index:9001;display:flex;flex-direction:column;gap:8px;}
    #${GIFT_INDICATOR_ID} .gift-btn{border:0;border-radius:999px;padding:8px 10px;background:linear-gradient(135deg,#fbbf24,#f97316);box-shadow:0 0 0 0 rgba(251,191,36,.8);animation:giftPulse 1.6s infinite;cursor:pointer;font-weight:800;color:#111}
    #${GIFT_INDICATOR_ID} .gift-btn.is-boost-active{animation:none;background:linear-gradient(135deg,#60a5fa,#818cf8);color:#fff;display:flex;align-items:center;gap:6px;padding:8px 12px}
    #${GIFT_INDICATOR_ID} .gift-btn .gift-timer{font-size:11px;font-weight:800;letter-spacing:.04em}
    @keyframes giftPulse{0%{box-shadow:0 0 0 0 rgba(251,191,36,.7)}70%{box-shadow:0 0 0 12px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}`;
  document.head.appendChild(style);
}

function mountGiftIndicator({ onClick } = {}) {
  ensureStyles();
  unmountGiftIndicator();
  const node = document.createElement('div');
  node.id = GIFT_INDICATOR_ID;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gift-btn';
  btn.textContent = '🎁';
  btn.title = 'Claim radar gift';
  btn.addEventListener('click', () => onClick?.());
  node.appendChild(btn);
  document.body.appendChild(node);
}

function mountBoostIndicator(activeBoosts = {}) {
  ensureStyles();
  unmountGiftIndicator();
  const node = document.createElement('div');
  node.id = GIFT_INDICATOR_ID;
  const btn = document.createElement('button');
  btn.type = 'button';
  const activeItems = [
    { key: 'radar_obstacles_24h', title: 'Radar Obstacles', iconClass: 'icon-radar-obstacles' },
    { key: 'radar_gold_24h', title: 'Radar Gold', iconClass: 'icon-radar-gold' }
  ].map((entry) => ({ ...entry, timer: activeBoosts?.[entry.key]?.active ? formatRemainingHours(activeBoosts?.[entry.key]?.endsAt) : null }))
    .filter((entry) => Boolean(entry.timer));

  if (!activeItems.length) return;

  activeItems.forEach((entry) => {
    const iconBtn = btn.cloneNode(false);
    iconBtn.className = 'gift-btn is-boost-active';
    iconBtn.title = entry.title;
    iconBtn.setAttribute('aria-label', entry.title);
    iconBtn.innerHTML = `<span class="icon-atlas ${entry.iconClass}" aria-hidden="true"></span><span class="gift-timer">${entry.timer}</span>`;
    node.appendChild(iconBtn);
  });
  document.body.appendChild(node);
}

function unmountGiftIndicator() {
  const node = document.getElementById(GIFT_INDICATOR_ID);
  if (node?.parentElement) node.parentElement.removeChild(node);
}

function renderActiveBoostIndicators() {
}

export { mountGiftIndicator, unmountGiftIndicator, renderActiveBoostIndicators };
export { mountBoostIndicator };
