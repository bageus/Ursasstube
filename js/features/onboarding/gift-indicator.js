const GIFT_INDICATOR_ID = 'onboardingGiftIndicator';

function findCoinsAnchor() {
  const gold = document.getElementById('goldVal');
  if (gold?.parentElement) return gold.parentElement;
  return document.querySelector('.coins-row') || null;
}

function unmountGiftIndicator() {
  const node = document.getElementById(GIFT_INDICATOR_ID);
  if (node?.parentElement) node.parentElement.removeChild(node);
}

function mountGiftIndicator({ label = '🎁 Radar gift', onClick } = {}) {
  if (typeof document === 'undefined') return false;
  const anchor = findCoinsAnchor();
  if (!anchor) return false;

  let btn = document.getElementById(GIFT_INDICATOR_ID);
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = GIFT_INDICATOR_ID;
    btn.className = 'ui-btn ui-btn--ghost onboarding-gift-indicator';
    btn.style.marginTop = '6px';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    anchor.parentElement?.appendChild(btn);
  }

  btn.textContent = String(label);
  btn.onclick = () => {
    if (typeof onClick === 'function') onClick();
  };
  return true;
}

export { mountGiftIndicator, unmountGiftIndicator };
