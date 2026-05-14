import { formatRemainingHours } from './boost-timer.js';

const GIFT_INDICATOR_ID = 'onboardingGiftIndicator';

function ensureStyles() {
  if (document.getElementById('onboardingGiftIndicatorStyles')) return;
  const style = document.createElement('style');
  style.id = 'onboardingGiftIndicatorStyles';
  style.textContent = `
    #${GIFT_INDICATOR_ID}{position:fixed;top:138px;right:20px;z-index:9001;display:flex;flex-direction:column;gap:8px;align-items:flex-end;}
    #${GIFT_INDICATOR_ID} .boost-indicator{height:34px;background:rgba(8,10,24,.32);border:1px solid rgba(255,255,255,.08);border-radius:999px;display:flex;align-items:center;gap:8px;padding:2px 8px 2px 4px;animation:none;cursor:default;pointer-events:none;}
    #${GIFT_INDICATOR_ID} .boost-indicator .boost-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:0;box-shadow:none;flex:0 0 28px;}
    #${GIFT_INDICATOR_ID} .boost-indicator .icon-atlas{width:24px;height:24px;display:inline-block;}
    #${GIFT_INDICATOR_ID} .boost-radar-obstacles .icon-atlas{filter:drop-shadow(0 0 6px rgba(59,130,246,.35));}
    #${GIFT_INDICATOR_ID} .boost-radar-gold .icon-atlas{filter:drop-shadow(0 0 6px rgba(168,85,247,.35));}
    #${GIFT_INDICATOR_ID} .boost-timer{font-size:13px;font-weight:800;color:#f8fafc;text-shadow:0 0 8px rgba(125,211,252,.35);letter-spacing:.02em;min-width:30px;text-align:left;}
    #${GIFT_INDICATOR_ID} .gift-btn{width:42px;height:42px;border:0;border-radius:999px;padding:0;background:linear-gradient(135deg,#fbbf24,#f97316);box-shadow:0 0 0 0 rgba(251,191,36,.8);animation:giftPulse 1.6s infinite;cursor:pointer;display:flex;align-items:center;justify-content:center;}
    #${GIFT_INDICATOR_ID} .gift-btn .icon-atlas.icon-gift-radar{width:22px;height:22px;background-size:110px auto;background-position:-22px -22px;filter:saturate(1.1) brightness(1.08);}
    @media (max-width: 600px){#${GIFT_INDICATOR_ID}{top:146px;right:14px;}}
    @keyframes giftPulse{0%{box-shadow:0 0 0 0 rgba(251,191,36,.7)}70%{box-shadow:0 0 0 12px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}`;
  document.head.appendChild(style);
}

function unmountGiftIndicator() {
  const node = document.getElementById(GIFT_INDICATOR_ID);
  if (node?.parentElement) node.parentElement.removeChild(node);
}

function renderGiftAndBoostIndicators({ gifts = {}, activeBoosts = {}, onGiftClick, currentScreen = 'menu' } = {}) {
  ensureStyles();
  unmountGiftIndicator();

  if (currentScreen !== 'menu') return;

  const activeItems = [
    { key: 'radar_obstacles_24h', title: 'Radar Obstacles', iconClass: 'icon-radar-obstacles', indicatorClass: 'boost-radar-obstacles' },
    { key: 'radar_gold_24h', title: 'Radar Gold', iconClass: 'icon-radar-gold', indicatorClass: 'boost-radar-gold' }
  ].map((entry) => ({
    ...entry,
    timer: activeBoosts?.[entry.key]?.active ? formatRemainingHours(activeBoosts?.[entry.key]?.endsAt) : null
  })).filter((entry) => Boolean(entry.timer));

  const hasUnclaimedGift = Boolean(
    (gifts?.radar_obstacles_24h?.available && !gifts?.radar_obstacles_24h?.claimed) ||
    (gifts?.radar_gold_24h?.available && !gifts?.radar_gold_24h?.claimed)
  );

  console.info('[gift-debug] renderGiftAndBoostIndicators', {
    gifts,
    activeBoosts,
    hasUnclaimedGift,
    activeItems
  });

  if (!activeItems.length && !hasUnclaimedGift) return;

  const node = document.createElement('div');
  node.id = GIFT_INDICATOR_ID;

  activeItems.forEach((entry) => {
    const boostBtn = document.createElement('button');
    boostBtn.type = 'button';
    boostBtn.className = `boost-indicator is-boost-active ${entry.indicatorClass}`;
    boostBtn.dataset.indicator = 'boost';
    boostBtn.title = `${entry.title} — ${entry.timer} left`;
    boostBtn.setAttribute('aria-label', `${entry.title} — ${entry.timer} left`);
    boostBtn.innerHTML = `<span class="boost-icon" aria-hidden="true"><span class="icon-atlas ${entry.iconClass}"></span></span><span class="boost-timer">${entry.timer}</span>`;
    node.appendChild(boostBtn);
  });

  if (hasUnclaimedGift) {
    const giftBtn = document.createElement('button');
    giftBtn.type = 'button';
    giftBtn.className = 'gift-btn is-gift-available';
    giftBtn.dataset.indicator = 'gift';
    giftBtn.setAttribute('aria-label', 'Claim radar gift');
    giftBtn.innerHTML = '<span class="icon-atlas icon-gift-radar" aria-hidden="true"></span>';
    giftBtn.title = 'Claim radar gift';
    giftBtn.addEventListener('click', () => onGiftClick?.());
    node.appendChild(giftBtn);
  }

  document.body.appendChild(node);
}

export { unmountGiftIndicator, renderGiftAndBoostIndicators };
