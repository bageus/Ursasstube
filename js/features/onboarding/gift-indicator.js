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

function unmountGiftIndicator() {
  const node = document.getElementById(GIFT_INDICATOR_ID);
  if (node?.parentElement) node.parentElement.removeChild(node);
}

function renderGiftAndBoostIndicators({ gifts = {}, activeBoosts = {}, onGiftClick } = {}) {
  ensureStyles();
  unmountGiftIndicator();

  const activeItems = [
    { key: 'radar_obstacles_24h', title: 'Radar Obstacles', iconClass: 'icon-radar-obstacles' },
    { key: 'radar_gold_24h', title: 'Radar Gold', iconClass: 'icon-radar-gold' }
  ].map((entry) => ({
    ...entry,
    timer: activeBoosts?.[entry.key]?.active ? formatRemainingHours(activeBoosts?.[entry.key]?.endsAt) : null
  })).filter((entry) => Boolean(entry.timer));

  const hasUnclaimedGift = Boolean(
    (gifts?.radar_obstacles_24h?.available && !gifts?.radar_obstacles_24h?.claimed) ||
    (gifts?.radar_gold_24h?.available && !gifts?.radar_gold_24h?.claimed)
  );

  if (!activeItems.length && !hasUnclaimedGift) return;

  const node = document.createElement('div');
  node.id = GIFT_INDICATOR_ID;

  activeItems.forEach((entry) => {
    const boostBtn = document.createElement('button');
    boostBtn.type = 'button';
    boostBtn.className = 'gift-btn is-boost-active';
    boostBtn.dataset.indicator = 'boost';
    boostBtn.title = entry.title;
    boostBtn.setAttribute('aria-label', entry.title);
    boostBtn.innerHTML = `<span class="icon-atlas ${entry.iconClass}" aria-hidden="true"></span><span class="gift-timer">${entry.timer}</span>`;
    node.appendChild(boostBtn);
  });

  if (hasUnclaimedGift) {
    const giftBtn = document.createElement('button');
    giftBtn.type = 'button';
    giftBtn.className = 'gift-btn is-gift-available';
    giftBtn.dataset.indicator = 'gift';
    giftBtn.textContent = '🎁';
    giftBtn.title = 'Claim radar gift';
    giftBtn.addEventListener('click', () => onGiftClick?.());
    node.appendChild(giftBtn);
  }

  document.body.appendChild(node);
}

export { unmountGiftIndicator, renderGiftAndBoostIndicators };
