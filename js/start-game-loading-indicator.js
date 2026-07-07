import { assetManager } from './assets.js';

const INDICATOR_ID = 'startGameLoadingIndicator';
const STYLE_ID = 'startGameLoadingIndicatorStyles';
let progressTimer = null;
let indicatorInstalled = false;

function installIndicatorStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${INDICATOR_ID} {
      position: absolute;
      left: 50%;
      bottom: max(64px, calc(env(safe-area-inset-bottom, 0px) + 52px));
      width: min(340px, calc(100vw - 48px));
      transform: translateX(-50%);
      z-index: 5;
      display: none;
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
      padding: 14px 16px;
      border: 1px solid rgba(192, 132, 252, .46);
      border-radius: 16px;
      background: rgba(10, 8, 22, .72);
      box-shadow: 0 0 24px rgba(96, 165, 250, .16);
      backdrop-filter: blur(10px);
      pointer-events: none;
    }

    #darkScreen.start-transition-active #${INDICATOR_ID} {
      display: flex;
    }

    .start-game-loading-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .1em;
      color: rgba(255, 255, 255, .92);
      text-align: center;
      text-transform: uppercase;
    }

    .start-game-loading-bar {
      height: 10px;
      overflow: hidden;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, .18);
      background: rgba(255, 255, 255, .06);
    }

    .start-game-loading-fill {
      width: var(--start-game-loading-progress, 12%);
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #c084ff, #60a5fa, #22d3ee);
      box-shadow: 0 0 18px rgba(96, 165, 250, .42);
      transition: width .18s ease;
    }

    .start-game-loading-text {
      min-height: 14px;
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      color: rgba(255, 255, 255, .68);
      text-align: center;
    }
  `;
  document.head?.append(style);
}

function ensureIndicator() {
  if (typeof document === 'undefined') return null;
  installIndicatorStyles();

  const darkScreen = document.getElementById('darkScreen');
  if (!darkScreen) return null;

  let indicator = document.getElementById(INDICATOR_ID);
  if (indicator) return indicator;

  indicator = document.createElement('div');
  indicator.id = INDICATOR_ID;
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = `
    <div class="start-game-loading-title">Preparing game</div>
    <div class="start-game-loading-bar" aria-hidden="true">
      <div class="start-game-loading-fill"></div>
    </div>
    <div class="start-game-loading-text">Loading assets…</div>
  `;
  darkScreen.appendChild(indicator);
  return indicator;
}

function setIndicatorProgress(percent, text) {
  const indicator = ensureIndicator();
  if (!indicator) return;
  const safePercent = Math.max(8, Math.min(100, Math.round(Number(percent) || 0)));
  indicator.style.setProperty('--start-game-loading-progress', `${safePercent}%`);
  const label = indicator.querySelector('.start-game-loading-text');
  if (label && text) label.textContent = text;
}

function getProgressText(percent) {
  if (percent < 40) return 'Loading assets…';
  if (percent < 75) return 'Preparing renderer…';
  if (percent < 96) return 'Rendering first frame…';
  return 'Almost ready…';
}

function startProgressLoop() {
  if (progressTimer) return;
  let optimisticProgress = 12;
  setIndicatorProgress(optimisticProgress, getProgressText(optimisticProgress));
  progressTimer = window.setInterval(() => {
    const assetProgress = Math.floor(assetManager.getProgress?.() || 0);
    optimisticProgress = Math.min(96, Math.max(optimisticProgress + 4, assetProgress));
    setIndicatorProgress(optimisticProgress, getProgressText(optimisticProgress));
  }, 180);
}

function stopProgressLoop() {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
  setIndicatorProgress(100, 'Starting…');
}

function syncIndicatorState() {
  const darkScreen = document.getElementById('darkScreen');
  if (!darkScreen) return;
  const isPreparing = darkScreen.classList.contains('start-transition-active');
  if (isPreparing) startProgressLoop();
  else stopProgressLoop();
}

function installStartGameLoadingIndicator() {
  if (indicatorInstalled || typeof document === 'undefined') return;
  indicatorInstalled = true;

  const attach = () => {
    const darkScreen = document.getElementById('darkScreen');
    if (!darkScreen) return;
    ensureIndicator();
    const observer = new MutationObserver(syncIndicatorState);
    observer.observe(darkScreen, { attributes: true, attributeFilter: ['class', 'style'] });
    syncIndicatorState();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }
}

export { installStartGameLoadingIndicator };
