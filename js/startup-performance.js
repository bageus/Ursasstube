import { trackAnalyticsEvent } from './analytics.js';
import { isTelegramRuntime } from './config.js';
import { logger } from './logger.js';

const STARTUP_PERFORMANCE_EVENT = 'startup_performance';
const START_GAME_ACTION = 'start-game';
const MAX_SAFE_DURATION_MS = 5 * 60 * 1000;
const REPEATABLE_MILESTONES = new Set([
  'start_game_click',
  'first_gameplay_frame',
  'simulation_start',
]);

const state = {
  installed: false,
  milestones: new Map(),
  leaderboardPreloadState: 'unknown',
  currentRun: null,
  runSequence: 0,
  lastStartGestureAt: 0,
  lastReportKey: null,
};

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function roundMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_SAFE_DURATION_MS) return undefined;
  return Math.round(numeric);
}

function sanitizeText(value, fallback = 'unknown') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return normalized || fallback;
}

function getPlatform() {
  if (typeof window === 'undefined') return 'server';
  const telegramPlatform = window.Telegram?.WebApp?.platform;
  return String(telegramPlatform || (isTelegramRuntime ? 'telegram' : 'web')).slice(0, 32);
}

function getMilestone(name) {
  return state.milestones.get(name)?.at;
}

function durationBetween(fromName, toName) {
  const from = getMilestone(fromName);
  const to = getMilestone(toName);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  return roundMs(to - from);
}

function durationFromRunClick(toName) {
  const clickAt = state.currentRun?.clickAt;
  const to = getMilestone(toName);
  if (!Number.isFinite(clickAt) || !Number.isFinite(to)) return undefined;
  return roundMs(to - clickAt);
}

function inferLeaderboardPreloadState() {
  if (state.leaderboardPreloadState !== 'unknown') return state.leaderboardPreloadState;
  if (typeof document === 'undefined') return 'unknown';

  const startList = document.getElementById('startLeaderboardList');
  const gameOverList = document.getElementById('gameOverLeaderboardList');
  const combinedText = `${startList?.textContent || ''} ${gameOverList?.textContent || ''}`.toLowerCase();
  if (combinedText.includes('loading')) return 'loading';
  if ((startList?.children?.length || 0) > 0 || (gameOverList?.children?.length || 0) > 0) return 'rendered';
  return 'unknown';
}

function setDebugHandle() {
  if (typeof window === 'undefined') return;
  window.__URSASS_STARTUP_PERF__ = {
    mark: markStartupMilestone,
    setLeaderboardPreloadState,
    getSnapshot: getStartupPerformanceSnapshot,
    report: reportStartupPerformance,
  };
}

function markStartupMilestone(name, metadata = {}) {
  const key = sanitizeText(name);
  if (!key) return null;

  const at = now();
  if (REPEATABLE_MILESTONES.has(key) || !state.milestones.has(key)) {
    state.milestones.set(key, { at, metadata: { ...metadata } });
  }

  if (key === 'simulation_start') {
    reportStartupPerformance({ reason: 'simulation_start' });
  }

  setDebugHandle();
  return state.milestones.get(key);
}

function setLeaderboardPreloadState(nextState) {
  state.leaderboardPreloadState = sanitizeText(nextState);
  markStartupMilestone(`leaderboard_${state.leaderboardPreloadState}`);
}

function findActionElement(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('[data-action]');
}

function resetRunMilestones() {
  for (const key of REPEATABLE_MILESTONES) {
    state.milestones.delete(key);
  }
  state.lastReportKey = null;
}

function recordStartGameClick(metadata = {}) {
  const at = now();
  if (at - state.lastStartGestureAt < 400) return state.currentRun;

  resetRunMilestones();
  state.runSequence += 1;
  state.lastStartGestureAt = at;
  state.currentRun = {
    id: state.runSequence,
    clickAt: at,
    source: sanitizeText(metadata.source || 'start_button'),
    rendererReadyAtClick: Number.isFinite(getMilestone('renderer_ready')) && getMilestone('renderer_ready') <= at,
    rendererPrewarmedAtClick: Number.isFinite(getMilestone('renderer_prewarmed')) && getMilestone('renderer_prewarmed') <= at,
    leaderboardPreloadStateAtClick: inferLeaderboardPreloadState(),
    appReadyAtClick: typeof document !== 'undefined' ? Boolean(document.body?.classList?.contains('app-ready')) : undefined,
  };
  markStartupMilestone('start_game_click', { runId: state.currentRun.id, source: state.currentRun.source });
  return state.currentRun;
}

function buildStartupPerformancePayload(extra = {}) {
  const appStartAt = getMilestone('bootstrap_start') ?? 0;
  const run = state.currentRun || null;
  const payload = {
    runtime: isTelegramRuntime ? 'telegram' : 'web',
    platform: getPlatform(),
    reason: sanitizeText(extra.reason || 'manual'),
    run_id: run?.id,
    source: run?.source,
    cold_start: run ? !run.rendererPrewarmedAtClick : undefined,
    renderer_ready_at_click: run?.rendererReadyAtClick,
    renderer_prewarmed_at_click: run?.rendererPrewarmedAtClick,
    leaderboard_preload_state_at_click: run?.leaderboardPreloadStateAtClick || inferLeaderboardPreloadState(),
    app_shell_ready_ms: roundMs(getMilestone('app_shell_ready') - appStartAt),
    auth_ready_ms: roundMs(getMilestone('auth_ready') - appStartAt),
    assets_ready_ms: roundMs(getMilestone('assets_ready') - appStartAt),
    renderer_ready_ms: roundMs(getMilestone('renderer_ready') - appStartAt),
    renderer_prewarmed_ms: roundMs(getMilestone('renderer_prewarmed') - appStartAt),
    app_ready_ms: roundMs(getMilestone('app_ready') - appStartAt),
    tap_to_first_frame_ms: durationFromRunClick('first_gameplay_frame'),
    tap_to_simulation_ms: durationFromRunClick('simulation_start'),
    first_frame_to_simulation_ms: durationBetween('first_gameplay_frame', 'simulation_start'),
    app_ready_to_click_ms: run ? roundMs(run.clickAt - getMilestone('app_ready')) : undefined,
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function getStartupPerformanceSnapshot() {
  return {
    milestones: Object.fromEntries([...state.milestones.entries()].map(([key, value]) => [key, { ...value }])),
    currentRun: state.currentRun ? { ...state.currentRun } : null,
    leaderboardPreloadState: state.leaderboardPreloadState,
    payload: buildStartupPerformancePayload({ reason: 'snapshot' }),
  };
}

function reportStartupPerformance(extra = {}) {
  const payload = buildStartupPerformancePayload(extra);
  const reportKey = `${payload.reason}:${payload.run_id || 0}:${payload.tap_to_simulation_ms || 'pending'}`;
  if (state.lastReportKey === reportKey) return payload;
  state.lastReportKey = reportKey;

  logger.info('[STARTUP PERF TELEMETRY]', payload);
  trackAnalyticsEvent(STARTUP_PERFORMANCE_EVENT, payload);
  setDebugHandle();
  return payload;
}

function onStartGesture(event) {
  const actionEl = findActionElement(event.target);
  if (!actionEl || actionEl.dataset.action !== START_GAME_ACTION) return;
  if (actionEl.disabled || actionEl.getAttribute('aria-disabled') === 'true') return;
  recordStartGameClick({ source: actionEl.id || START_GAME_ACTION });
}

function installStartupPerformanceTelemetry() {
  if (state.installed || typeof document === 'undefined') return;
  state.installed = true;
  markStartupMilestone('bootstrap_start');
  document.addEventListener('pointerdown', onStartGesture, { capture: true, passive: true });
  document.addEventListener('click', onStartGesture, { capture: true, passive: true });
  setDebugHandle();
}

export {
  installStartupPerformanceTelemetry,
  markStartupMilestone,
};