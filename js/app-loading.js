const HOLD_PROGRESS = 0.8;
const FALLBACK_TIMEOUT_MS = 12000;
const NON_CRITICAL_FAIL_OPEN_MS = 7000;
const CRITICAL_STALL_TIMEOUT_MS = 15000;

const state = {
  progress: 0,
  flags: {
    shellReady: false,
    authReady: false,
    gameRuntimeReady: false,
    authFailed: false,
  },
  appReady: false,
  intervalId: null,
  fallbackTimerId: null,
  failOpenTimerId: null,
  criticalStallTimerId: null,
  completeTimerId: null,
  statusEl: null,
  fillEl: null,
  textEl: null,
  readyPromise: null,
  resolveReady: null,
};

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function updateProgressUi() {
  if (state.fillEl) state.fillEl.style.width = `${Math.round(state.progress * 100)}%`;
}

function setAppLoadingProgress(value, label = '') {
  state.progress = clamp01(value);
  updateProgressUi();
  if (state.textEl && label) state.textEl.textContent = label;
}

function shouldBecomeReady() {
  return state.flags.shellReady && state.flags.authReady && !state.flags.authFailed;
}

function hasCriticalReadiness() {
  return state.flags.shellReady && state.flags.authReady && !state.flags.authFailed;
}

function finalizeReady() {
  if (state.appReady) return;
  state.appReady = true;
  if (state.intervalId) window.clearInterval(state.intervalId);
  if (state.fallbackTimerId) window.clearTimeout(state.fallbackTimerId);
  if (state.failOpenTimerId) window.clearTimeout(state.failOpenTimerId);
  if (state.criticalStallTimerId) window.clearTimeout(state.criticalStallTimerId);
  setAppLoadingProgress(1, 'Ready');
  state.statusEl?.classList.add('is-complete');
  document.body?.classList.remove('loading-ui');
  document.body?.classList.add('app-ready', 'ui-stable');
  state.completeTimerId = window.setTimeout(() => state.statusEl?.classList.add('is-hidden'), 280);
  if (typeof state.resolveReady === 'function') state.resolveReady(true);
}

function evaluateReadiness() {
  if (shouldBecomeReady()) finalizeReady();
}

function startFakeProgress() {
  state.intervalId = window.setInterval(() => {
    if (state.appReady) return;
    const step = state.progress < 0.55 ? 0.02 : state.progress < HOLD_PROGRESS ? 0.008 : 0.001;
    const next = Math.min(HOLD_PROGRESS, state.progress + step);
    setAppLoadingProgress(next, next >= HOLD_PROGRESS ? 'Finalizing…' : 'Loading…');
    if (next >= HOLD_PROGRESS) state.statusEl?.classList.add('is-waiting');
  }, 260);
}

function failLoading(message = 'Loading took too long. Please reopen app.') {
  state.flags.authFailed = true;
  if (state.intervalId) window.clearInterval(state.intervalId);
  setAppLoadingProgress(HOLD_PROGRESS, message);
  state.statusEl?.classList.add('is-failed', 'is-waiting');
}

function initAppLoading() {
  state.statusEl = document.getElementById('appLoadingStatus');
  state.fillEl = document.getElementById('appLoadingBarFill');
  state.textEl = document.getElementById('appLoadingText');
  state.readyPromise = new Promise((resolve) => {
    state.resolveReady = resolve;
  });
  document.body?.classList.add('loading-ui');
  document.body?.classList.remove('app-ready');
  setAppLoadingProgress(0.03, 'Loading…');
  startFakeProgress();
  state.failOpenTimerId = window.setTimeout(() => {
    if (!state.appReady && hasCriticalReadiness()) {
      finalizeReady();
    }
  }, NON_CRITICAL_FAIL_OPEN_MS);
  state.fallbackTimerId = window.setTimeout(() => {
    if (!state.appReady && hasCriticalReadiness()) {
      finalizeReady();
    }
  }, FALLBACK_TIMEOUT_MS);
  state.criticalStallTimerId = window.setTimeout(() => {
    if (!state.appReady) {
      const reason = state.flags.authReady ? 'startup did not finish' : 'auth did not finish';
      failLoading(`Loading failed: ${reason}. Please reload.`);
    }
  }, CRITICAL_STALL_TIMEOUT_MS);
}

function markAppShellReady() { state.flags.shellReady = true; evaluateReadiness(); }
function markAuthReady() { state.flags.authReady = true; evaluateReadiness(); }
function markGameRuntimeReady() { state.flags.gameRuntimeReady = true; evaluateReadiness(); }
function markAuthFailed(message = 'Telegram auth failed. Reopen app.') { failLoading(message); }
function markAppReady() { finalizeReady(); }
function waitForAppReady() { return state.readyPromise || Promise.resolve(state.appReady); }

export {
  initAppLoading,
  setAppLoadingProgress,
  markAppShellReady,
  markAuthReady,
  markGameRuntimeReady,
  markAuthFailed,
  markAppReady,
  waitForAppReady
};
