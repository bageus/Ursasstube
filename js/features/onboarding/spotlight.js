let spotlightRoot = null;
let cleanupFns = [];
let rafId = null;
let styleTag = null;

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
    'left:0',
    'top:0',
    'width:100vw',
    'height:100dvh',
    'min-height:-webkit-fill-available',
    'z-index:2147483647',
    'pointer-events:none',
    'font-family:inherit',
  ].join(';');

  document.body.appendChild(spotlightRoot);
  return spotlightRoot;
}


function ensureSpotlightStyles() {
  if (styleTag || typeof document === 'undefined') return;

  styleTag = document.createElement('style');
  styleTag.id = 'onboarding-spotlight-styles';
  styleTag.textContent = `
    .onboarding-spotlight-skip {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      right: max(12px, env(safe-area-inset-right));
      padding: 8px 12px;
      border: 0;
      border-radius: 999px;
      background: #111827;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      pointer-events: auto;
      z-index: 4;
      transition: background-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
    }

    .onboarding-spotlight-skip:hover,
    .onboarding-spotlight-skip:focus-visible {
      background: #1f2937;
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
    }

    .onboarding-spotlight-skip:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.88);
      outline-offset: 2px;
    }
  `;

  document.head.appendChild(styleTag);
}

function getViewportRect() {
  return {
    left: 0,
    top: 0,
    width: window.visualViewport?.width || window.innerWidth,
    height: window.visualViewport?.height || window.innerHeight,
  };
}

function isTelegramEnvironment() {
  return Boolean(window.Telegram?.WebApp);
}

async function waitForScrollSettle(frames = 2) {
  if (typeof window === 'undefined') return;

  let stableFrames = 0;
  let prevX = window.scrollX;
  let prevY = window.scrollY;

  while (stableFrames < frames) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const nextX = window.scrollX;
    const nextY = window.scrollY;
    const isStable = Math.abs(nextX - prevX) < 0.5 && Math.abs(nextY - prevY) < 0.5;
    stableFrames = isStable ? stableFrames + 1 : 0;
    prevX = nextX;
    prevY = nextY;
  }
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

function findScrollableParent(element) {
  if (!element || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  let current = element.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style?.overflowY || style?.overflow || 'visible';
    const isScrollable = /(auto|scroll|overlay)/.test(overflowY);
    if (isScrollable && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}


async function waitForStableLayout(targetElement, attempts = 6) {
  if (!targetElement || typeof window === 'undefined') return;

  let previous = targetElement.getBoundingClientRect();

  for (let i = 0; i < attempts; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const current = targetElement.getBoundingClientRect();
    const isStable =
      Math.abs(current.top - previous.top) < 0.5
      && Math.abs(current.left - previous.left) < 0.5
      && Math.abs(current.width - previous.width) < 0.5
      && Math.abs(current.height - previous.height) < 0.5;

    if (isStable) return;
    previous = current;
  }
}

async function centerTargetInScrollableArea(targetElement) {
  if (!targetElement || typeof window === 'undefined') return;

  const scrollParent = findScrollableParent(targetElement);
  if (!scrollParent) return;

  const isDocScroller = scrollParent === document.scrollingElement || scrollParent === document.documentElement || scrollParent === document.body;
  const scrollTop = isDocScroller ? window.scrollY : scrollParent.scrollTop;
  const clientHeight = isDocScroller ? window.innerHeight : scrollParent.clientHeight;
  const scrollHeight = isDocScroller
    ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
    : scrollParent.scrollHeight;
  const canScroll = scrollHeight > clientHeight + 1;
  if (!canScroll) return;

  const targetRect = targetElement.getBoundingClientRect();
  const parentRect = isDocScroller
    ? { top: 0, height: window.innerHeight }
    : scrollParent.getBoundingClientRect();

  const targetCenter = targetRect.top + targetRect.height / 2;
  const viewportCenter = parentRect.top + parentRect.height / 2;
  const delta = targetCenter - viewportCenter;
  if (Math.abs(delta) <= Math.max(24, targetRect.height * 0.2)) return;

  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const nextTop = Math.min(maxScroll, Math.max(0, scrollTop + delta));
  if (Math.abs(nextTop - scrollTop) < 1) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const behavior = (reduceMotion || isTelegramEnvironment()) ? 'auto' : 'smooth';

  if (isDocScroller) {
    window.scrollTo({ top: nextTop, behavior });
  } else {
    scrollParent.scrollTo({ top: nextTop, behavior });
  }

  if (behavior === 'auto') {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
}

export async function showSpotlight({ target, text = '', content = null, showSkip = true, onSkip, onTargetClick, step = 'unknown' } = {}) {
  const root = ensureSpotlightRoot();
  if (!root || !target) return false;

  const targetElement = typeof target === 'string' ? document.querySelector(target) : target;
  if (!targetElement) return false;

  hideSpotlight();

  ensureSpotlightStyles();

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.style.pointerEvents = 'auto';

  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:100vw',
    'height:100dvh',
    'min-height:-webkit-fill-available',
    'pointer-events:none',
  ].join(';');

  const dimmer = document.createElement('div');
  dimmer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';

  const dimTop = document.createElement('div');
  const dimRight = document.createElement('div');
  const dimBottom = document.createElement('div');
  const dimLeft = document.createElement('div');
  [dimTop, dimRight, dimBottom, dimLeft].forEach((part) => {
    part.style.cssText = 'position:absolute;background:rgba(5,8,15,0.68);pointer-events:auto;';
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

  const targetProxy = document.createElement('button');
  targetProxy.type = 'button';
  targetProxy.setAttribute('aria-label', 'Activate highlighted target');
  targetProxy.style.cssText = [
    'position:absolute',
    'border:0',
    'padding:0',
    'margin:0',
    'background:transparent',
    'border-radius:14px',
    'pointer-events:auto',
    'cursor:pointer',
    'z-index:3',
    'outline:none',
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

  const appendBubbleContent = () => {
    if (content instanceof Node) {
      bubble.appendChild(content);
      return;
    }

    if (typeof content === 'function') {
      const built = content();
      if (built instanceof Node) {
        bubble.appendChild(built);
        return;
      }
    }

    const textNode = document.createElement('div');
    textNode.textContent = text || '';
    bubble.appendChild(textNode);
  };
  appendBubbleContent();

  let skipFixedBtn = null;
  if (showSkip) {
    skipFixedBtn = document.createElement('button');
    skipFixedBtn.type = 'button';
    skipFixedBtn.textContent = 'Skip';
    skipFixedBtn.className = 'onboarding-spotlight-skip';
  }

  const hasText = String(text || '').trim().length > 0;
  const hasContent = Boolean(content);
  if (!hasText && !hasContent) {
    bubble.style.display = 'none';
  }

  container.append(dimmer, hole, targetProxy, bubble);
  if (skipFixedBtn) container.appendChild(skipFixedBtn);
  root.appendChild(container);

  const viewportPadding = 12;
  const highlightPadding = 8;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);


  const place = (targetRect = targetElement.getBoundingClientRect()) => {
    const viewport = getViewportRect();

    const left = clamp(targetRect.left - highlightPadding, 8, viewport.width - 24);
    const top = clamp(targetRect.top - highlightPadding, 8, viewport.height - 24);
    const width = Math.max(24, Math.min(targetRect.width + highlightPadding * 2, viewport.width - left - 8));
    const height = Math.max(24, Math.min(targetRect.height + highlightPadding * 2, viewport.height - top - 8));
    const holeRight = left + width;
    const holeBottom = top + height;

    hole.style.left = `${left}px`;
    hole.style.top = `${top}px`;
    hole.style.width = `${width}px`;
    hole.style.height = `${height}px`;

    targetProxy.style.left = `${left}px`;
    targetProxy.style.top = `${top}px`;
    targetProxy.style.width = `${width}px`;
    targetProxy.style.height = `${height}px`;
    dimTop.style.left = '0px';
    dimTop.style.top = '0px';
    dimTop.style.width = `${viewport.width}px`;
    dimTop.style.height = `${Math.max(0, top)}px`;

    dimBottom.style.left = '0px';
    dimBottom.style.top = `${Math.min(viewport.height, holeBottom)}px`;
    dimBottom.style.width = `${viewport.width}px`;
    dimBottom.style.height = `${Math.max(0, viewport.height - holeBottom)}px`;

    dimLeft.style.left = '0px';
    dimLeft.style.top = `${top}px`;
    dimLeft.style.width = `${Math.max(0, left)}px`;
    dimLeft.style.height = `${height}px`;

    dimRight.style.left = `${Math.min(viewport.width, holeRight)}px`;
    dimRight.style.top = `${top}px`;
    dimRight.style.width = `${Math.max(0, viewport.width - holeRight)}px`;
    dimRight.style.height = `${height}px`;

    if (isTelegramEnvironment()) {
      console.debug('[spotlight-tg-debug]', {
        target,
        rect: targetRect,
        viewport,
        scrollY: window.scrollY,
        visualViewport: window.visualViewport
          ? {
            width: window.visualViewport.width,
            height: window.visualViewport.height,
            offsetLeft: window.visualViewport.offsetLeft,
            offsetTop: window.visualViewport.offsetTop,
            pageLeft: window.visualViewport.pageLeft,
            pageTop: window.visualViewport.pageTop,
          }
          : null,
        hole: { left, top, width, height },
      });
    }

    if (!hasText && !hasContent) return;

    const bubbleRect = bubble.getBoundingClientRect();
    const belowTop = top + height + 10;
    const aboveTop = top - bubbleRect.height - 10;
    const minBubbleLeft = viewportPadding;
    const maxBubbleLeft = viewport.width - bubbleRect.width - viewportPadding;
    const centeredBubbleLeft = left + (width - bubbleRect.width) / 2;

    let bubbleLeft = centeredBubbleLeft;
    if (maxBubbleLeft <= minBubbleLeft) bubbleLeft = minBubbleLeft;
    else bubbleLeft = Math.min(Math.max(centeredBubbleLeft, minBubbleLeft), maxBubbleLeft);

    let bubbleTop = belowTop;

    if (belowTop + bubbleRect.height > viewport.height - viewportPadding) {
      bubbleTop = Math.max(viewportPadding, aboveTop);
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

  let isDispatchingTargetClick = false;
  const setTargetHoverState = (hovered) => {
    hole.style.borderColor = hovered ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.85)';
    hole.style.boxShadow = hovered
      ? '0 0 0 2px rgba(255,255,255,0.2), 0 0 26px rgba(125, 211, 252, 0.45)'
      : '0 0 0 1px rgba(255,255,255,0.16)';
  };

  const onProxyClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isDispatchingTargetClick) return;
    isDispatchingTargetClick = true;
    targetElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    if (typeof onTargetClick === 'function') onTargetClick({ target, element: targetElement });
    isDispatchingTargetClick = false;
  };

  targetProxy.addEventListener('click', onProxyClick);
  targetProxy.addEventListener('mouseenter', () => setTargetHoverState(true));
  targetProxy.addEventListener('mouseleave', () => setTargetHoverState(false));
  targetProxy.addEventListener('focus', () => setTargetHoverState(true));
  targetProxy.addEventListener('blur', () => setTargetHoverState(false));

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
  cleanupFns.push(() => targetProxy.removeEventListener('click', onProxyClick));
  cleanupFns.push(() => setTargetHoverState(false));

  await centerTargetInScrollableArea(targetElement);
  await waitForScrollSettle();
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const rectAfterScroll = targetElement.getBoundingClientRect();
  if (rectAfterScroll.width <= 0 || rectAfterScroll.height <= 0) {
    console.warn('Onboarding spotlight target has empty rect after scroll', { step, target });
  }

  await waitForStableLayout(targetElement);
  place(rectAfterScroll);
  const targetRect = rectAfterScroll;
  if (targetRect.width <= 0 || targetRect.height <= 0) {
    console.warn('Onboarding spotlight target has empty rect', { step, target });
  }
  return true;
}


if (typeof window !== 'undefined') {
  window.__ursasOnboardingSpotlight = { showSpotlight, hideSpotlight };
}
