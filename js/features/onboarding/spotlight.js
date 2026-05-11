let spotlightRoot = null;
let cleanupFns = [];
let rafId = null;

function clearCleanup() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
}

function ensureSpotlightRoot() {
  if (spotlightRoot || typeof document === 'undefined') return spotlightRoot;

  spotlightRoot = document.createElement('div');
  spotlightRoot.id = 'onboarding-spotlight-root';
  spotlightRoot.hidden = true;
  spotlightRoot.setAttribute('aria-hidden', 'true');
  spotlightRoot.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'pointer-events:none',
    'font-family:inherit',
  ].join(';');

  document.body.appendChild(spotlightRoot);
  return spotlightRoot;
}

function getViewportRect() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) {
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  return {
    left: vv.offsetLeft || 0,
    top: vv.offsetTop || 0,
    width: vv.width || window.innerWidth,
    height: vv.height || window.innerHeight,
  };
}

export function hideSpotlight() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  clearCleanup();

  if (!spotlightRoot) return;
  spotlightRoot.hidden = true;
  spotlightRoot.setAttribute('aria-hidden', 'true');
  spotlightRoot.innerHTML = '';
}

export function showSpotlight({ target, text = '', showSkip = true, onSkip, onTargetClick, step = 'unknown' } = {}) {
  const root = ensureSpotlightRoot();
  if (!root || !target) return false;

  const targetElement = typeof target === 'string' ? document.querySelector(target) : target;
  if (!targetElement) return false;

  hideSpotlight();

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.style.pointerEvents = 'auto';

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;';

  const dimmer = document.createElement('div');
  dimmer.style.cssText = 'position:absolute;inset:0;pointer-events:auto;';

  const dimTop = document.createElement('div');
  const dimRight = document.createElement('div');
  const dimBottom = document.createElement('div');
  const dimLeft = document.createElement('div');
  [dimTop, dimRight, dimBottom, dimLeft].forEach((part) => {
    part.style.cssText = 'position:absolute;background:rgba(5,8,15,0.68);';
    dimmer.appendChild(part);
  });

  const hole = document.createElement('div');
  hole.style.cssText = [
    'position:absolute',
    'border-radius:14px',
    'border:2px solid rgba(255,255,255,0.85)',
    'pointer-events:none',
    'transition:all 0.15s ease',
  ].join(';');

  const bubble = document.createElement('div');
  bubble.style.cssText = [
    'position:absolute',
    'background:#fff',
    'color:#111827',
    'border-radius:12px',
    'padding:12px 14px',
    'max-width:min(300px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)))',
    'box-shadow:0 12px 30px rgba(0,0,0,0.35)',
    'line-height:1.35',
    'font-size:14px',
    'pointer-events:auto',
  ].join(';');

  const textNode = document.createElement('div');
  textNode.textContent = text || '';
  bubble.appendChild(textNode);

  let skipFixedBtn = null;
  if (showSkip) {
    skipFixedBtn = document.createElement('button');
    skipFixedBtn.type = 'button';
    skipFixedBtn.textContent = 'Skip';
    skipFixedBtn.style.cssText = [
      'position:fixed',
      'top:max(12px, env(safe-area-inset-top))',
      'right:max(12px, env(safe-area-inset-right))',
      'padding:8px 12px',
      'border:0',
      'border-radius:999px',
      'background:#111827',
      'color:#fff',
      'font-size:13px',
      'cursor:pointer',
      'pointer-events:auto',
      'z-index:4',
    ].join(';');
  }

  if (!String(text || '').trim()) {
    bubble.style.display = 'none';
  }

  container.append(dimmer, hole, bubble);
  if (skipFixedBtn) container.appendChild(skipFixedBtn);
  root.appendChild(container);

  const viewportPadding = 12;
  const highlightPadding = 8;

  const place = () => {
    const targetRect = targetElement.getBoundingClientRect();
    const viewport = getViewportRect();

    const left = Math.max(viewport.left + viewportPadding, targetRect.left - highlightPadding);
    const top = Math.max(viewport.top + viewportPadding, targetRect.top - highlightPadding);
    const width = Math.max(24, targetRect.width + highlightPadding * 2);
    const height = Math.max(24, targetRect.height + highlightPadding * 2);

    hole.style.left = `${left}px`;
    hole.style.top = `${top}px`;
    hole.style.width = `${width}px`;
    hole.style.height = `${height}px`;
    dimTop.style.left = `${viewport.left}px`;
    dimTop.style.top = `${viewport.top}px`;
    dimTop.style.width = `${viewport.width}px`;
    dimTop.style.height = `${Math.max(0, top - viewport.top)}px`;

    dimBottom.style.left = `${viewport.left}px`;
    dimBottom.style.top = `${Math.min(viewport.top + viewport.height, top + height)}px`;
    dimBottom.style.width = `${viewport.width}px`;
    dimBottom.style.height = `${Math.max(0, viewport.top + viewport.height - (top + height))}px`;

    dimLeft.style.left = `${viewport.left}px`;
    dimLeft.style.top = `${top}px`;
    dimLeft.style.width = `${Math.max(0, left - viewport.left)}px`;
    dimLeft.style.height = `${height}px`;

    dimRight.style.left = `${Math.min(viewport.left + viewport.width, left + width)}px`;
    dimRight.style.top = `${top}px`;
    dimRight.style.width = `${Math.max(0, viewport.left + viewport.width - (left + width))}px`;
    dimRight.style.height = `${height}px`;

    if (!String(text || '').trim()) return;

    const bubbleRect = bubble.getBoundingClientRect();
    const belowTop = top + height + 10;
    const aboveTop = top - bubbleRect.height - 10;
    const maxBubbleLeft = viewport.left + viewport.width - bubbleRect.width - viewportPadding;

    let bubbleLeft = Math.min(Math.max(left, viewport.left + viewportPadding), maxBubbleLeft);
    let bubbleTop = belowTop;

    if (belowTop + bubbleRect.height > viewport.top + viewport.height - viewportPadding) {
      bubbleTop = Math.max(viewport.top + viewportPadding, aboveTop);
    }

    bubble.style.left = `${bubbleLeft}px`;
    bubble.style.top = `${bubbleTop}px`;
  };

  const schedulePlace = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      place();
    });
  };

  const swallowClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  dimmer.addEventListener('click', swallowClick);
  const targetClickHandler = () => {
    if (typeof onTargetClick === 'function') onTargetClick({ target, element: targetElement });
  };
  targetElement.addEventListener('click', targetClickHandler);

  if (skipFixedBtn) {
    const onSkipClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideSpotlight();
      if (typeof onSkip === 'function') onSkip();
    };
    skipFixedBtn.addEventListener('click', onSkipClick);
  }

  const addWindowListener = (eventName, handler, opts) => {
    window.addEventListener(eventName, handler, opts);
    cleanupFns.push(() => window.removeEventListener(eventName, handler, opts));
  };

  addWindowListener('resize', schedulePlace);
  addWindowListener('scroll', schedulePlace, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedulePlace);
    window.visualViewport.addEventListener('scroll', schedulePlace);
    cleanupFns.push(() => window.visualViewport.removeEventListener('resize', schedulePlace));
    cleanupFns.push(() => window.visualViewport.removeEventListener('scroll', schedulePlace));
  }

  cleanupFns.push(() => dimmer.removeEventListener('click', swallowClick));
  cleanupFns.push(() => targetElement.removeEventListener('click', targetClickHandler));

  schedulePlace();
  const targetRect = targetElement.getBoundingClientRect();
  if (targetRect.width <= 0 || targetRect.height <= 0) {
    console.warn('Onboarding spotlight target has empty rect', { step, target });
  }
  return true;
}


if (typeof window !== 'undefined') {
  window.__ursasOnboardingSpotlight = { showSpotlight, hideSpotlight };
}
