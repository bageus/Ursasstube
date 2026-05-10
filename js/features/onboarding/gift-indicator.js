const GIFT_INDICATOR_ID = 'onboardingGiftIndicator';
const BOOSTS_ID = 'onboardingActiveRadarBoosts';

function ensureStyles() {
  if (document.getElementById('onboardingGiftIndicatorStyles')) return;
  const style = document.createElement('style');
  style.id = 'onboardingGiftIndicatorStyles';
  style.textContent = `
    #${GIFT_INDICATOR_ID}{position:fixed;top:90px;right:20px;z-index:9001;}
    #${GIFT_INDICATOR_ID} .gift-btn{border:0;border-radius:999px;padding:8px 10px;background:linear-gradient(135deg,#fbbf24,#f97316);box-shadow:0 0 0 0 rgba(251,191,36,.8);animation:giftPulse 1.6s infinite;cursor:pointer;font-weight:800;color:#111}
    #${BOOSTS_ID}{position:fixed;top:130px;right:20px;z-index:9001;display:flex;flex-direction:column;gap:6px}
    #${BOOSTS_ID} .boost-pill{background:rgba(17,24,39,.9);border:1px solid rgba(251,191,36,.4);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700;color:#fde68a}
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

function unmountGiftIndicator() {
  const node = document.getElementById(GIFT_INDICATOR_ID);
  if (node?.parentElement) node.parentElement.removeChild(node);
}

function renderActiveBoostIndicators(activeBoosts = {}) {
  const old = document.getElementById(BOOSTS_ID);
  if (old?.parentElement) old.parentElement.removeChild(old);
  const rows = [];
  const now = Date.now();
  for (const [key, label] of [['radar_obstacles_24h', '📡 Radar Obstacles'], ['radar_gold_24h', '🪙 Radar Gold']]) {
    const boost = activeBoosts[key];
    if (!boost?.active || !Number.isFinite(Number(boost.endsAt))) continue;
    const remainingMs = Math.max(0, Number(boost.endsAt) - now);
    if (remainingMs <= 0) continue;
    const hours = Math.max(1, Math.ceil(remainingMs / 3600000));
    rows.push(`${label}: ${hours}h`);
  }
  if (!rows.length) return;
  const root = document.createElement('div');
  root.id = BOOSTS_ID;
  rows.forEach((text) => {
    const pill = document.createElement('div');
    pill.className = 'boost-pill';
    pill.textContent = text;
    root.appendChild(pill);
  });
  document.body.appendChild(root);
}

export { mountGiftIndicator, unmountGiftIndicator, renderActiveBoostIndicators };
