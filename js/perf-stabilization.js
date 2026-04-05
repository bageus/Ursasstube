import { logger } from './logger.js';
import { APP_VISIBILITY_EVENT, PERF_SAMPLE_EVENT, SCREEN_CHANGED_EVENT } from './runtime-events.js';

const PERF_SUMMARY_EVENT = 'ursas:perf-summary';
const MAX_SAMPLES = 180;
const SUMMARY_INTERVAL_MS = 15000;

let summaryIntervalId = null;
let perfSampleHandler = null;
let perfSamples = [];
let visibilityStats = {
  hiddenCount: 0,
  visibleCount: 0,
  lastChangedAt: 0
};
let visibilityHandler = null;
let screenStats = {
  menu: 0,
  store: 0,
  rules: 0,
  gameplay: 0,
  gameOver: 0,
  lastChangedAt: 0
};
let screenHandler = null;

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const rank = Math.ceil((p / 100) * sortedValues.length) - 1;
  const index = Math.min(Math.max(rank, 0), sortedValues.length - 1);
  return sortedValues[index];
}

function summarize(samples) {
  if (!samples.length) {
    return {
      sampleCount: 0,
      fps: { avg: 0, p50: 0, p95: 0, min: 0, max: 0 },
      frameMs: { avg: 0, p50: 0, p95: 0, min: 0, max: 0 },
      pingMs: { avg: 0, p50: 0, p95: 0, min: 0, max: 0 },
      visibility: { ...visibilityStats },
      screenTransitions: { ...screenStats },
      smokeChecklist: getSmokeChecklistStatus()
    };
  }

  const fpsValues = samples.map((sample) => toNumber(sample.fps)).sort((a, b) => a - b);
  const frameMsValues = samples.map((sample) => toNumber(sample.frameMs)).sort((a, b) => a - b);
  const pingMsValues = samples.map((sample) => toNumber(sample.pingMs)).sort((a, b) => a - b);

  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const withRounded = (value) => Number(value.toFixed(2));
  const metrics = (values) => ({
    avg: withRounded(avg(values)),
    p50: withRounded(percentile(values, 50)),
    p95: withRounded(percentile(values, 95)),
    min: withRounded(values[0]),
    max: withRounded(values[values.length - 1])
  });

  return {
    sampleCount: samples.length,
    fps: metrics(fpsValues),
    frameMs: metrics(frameMsValues),
    pingMs: metrics(pingMsValues),
    visibility: { ...visibilityStats },
    screenTransitions: { ...screenStats },
    smokeChecklist: getSmokeChecklistStatus()
  };
}

function extractSample(detail) {
  return {
    timestamp: toNumber(detail?.timestamp, Date.now()),
    fps: toNumber(detail?.fps),
    frameMs: toNumber(detail?.debugStats?.frameMs),
    pingMs: toNumber(detail?.pingMs)
  };
}

function normalizeScreenName(screen) {
  if (screen === 'game-over') return 'gameOver';
  if (screen === 'menu' || screen === 'store' || screen === 'rules' || screen === 'gameplay') return screen;
  return null;
}

function handleScreenChange(event) {
  const normalized = normalizeScreenName(event?.detail?.screen);
  if (!normalized) return;

  screenStats = {
    ...screenStats,
    [normalized]: screenStats[normalized] + 1,
    lastChangedAt: Date.now()
  };
}

function handleVisibilityChange(event) {
  const hidden = Boolean(event?.detail?.hidden);
  visibilityStats = {
    hiddenCount: visibilityStats.hiddenCount + (hidden ? 1 : 0),
    visibleCount: visibilityStats.visibleCount + (hidden ? 0 : 1),
    lastChangedAt: Date.now()
  };
}

function getSmokeChecklistStatus() {
  const checklist = {
    gameplayStarted: screenStats.gameplay > 0,
    reachedGameOver: screenStats.gameOver > 0,
    returnedToMenu: screenStats.menu > 0,
    pauseResumeObserved: visibilityStats.hiddenCount > 0 && visibilityStats.visibleCount > 0,
    openedStoreOrRules: screenStats.store > 0 || screenStats.rules > 0
  };

  const completed = Object.values(checklist).filter(Boolean).length;
  return {
    ...checklist,
    completed,
    total: Object.keys(checklist).length
  };
}

function publishSummary() {
  const summary = summarize(perfSamples);
  window.dispatchEvent(new CustomEvent(PERF_SUMMARY_EVENT, {
    detail: {
      timestamp: Date.now(),
      summary
    }
  }));

  logger.info('📊 Perf summary', summary);
}

function getMIG08Snapshot() {
  const summary = summarize(perfSamples);
  return {
    capturedAt: new Date().toISOString(),
    sampleCount: summary.sampleCount,
    kpi: {
      fpsP50: summary.fps.p50,
      fpsP95: summary.fps.p95,
      frameMsP50: summary.frameMs.p50,
      frameMsP95: summary.frameMs.p95,
      pingMsP50: summary.pingMs.p50,
      pingMsP95: summary.pingMs.p95
    },
    visibility: summary.visibility,
    screenTransitions: summary.screenTransitions,
    smokeChecklist: summary.smokeChecklist
  };
}

function initializePerfStabilizationLifecycle() {
  if (perfSampleHandler) {
    return cleanupPerfStabilizationLifecycle;
  }

  perfSampleHandler = (event) => {
    perfSamples.push(extractSample(event.detail));
    if (perfSamples.length > MAX_SAMPLES) {
      perfSamples = perfSamples.slice(-MAX_SAMPLES);
    }
  };

  window.addEventListener(PERF_SAMPLE_EVENT, perfSampleHandler);

  if (!visibilityHandler) {
    visibilityHandler = handleVisibilityChange;
    window.addEventListener(APP_VISIBILITY_EVENT, visibilityHandler);
  }

  if (!screenHandler) {
    screenHandler = handleScreenChange;
    window.addEventListener(SCREEN_CHANGED_EVENT, screenHandler);
  }

  summaryIntervalId = window.setInterval(() => {
    publishSummary();
  }, SUMMARY_INTERVAL_MS);

  window.ursasPerf = {
    getSampleCount: () => perfSamples.length,
    getSummary: () => summarize(perfSamples),
    getMIG08Snapshot,
    getVisibilityStats: () => ({ ...visibilityStats }),
    getScreenStats: () => ({ ...screenStats }),
    getSmokeChecklistStatus,
    reset: () => {
      perfSamples = [];
      visibilityStats = { hiddenCount: 0, visibleCount: 0, lastChangedAt: 0 };
      screenStats = { menu: 0, store: 0, rules: 0, gameplay: 0, gameOver: 0, lastChangedAt: 0 };
    }
  };

  return cleanupPerfStabilizationLifecycle;
}

function cleanupPerfStabilizationLifecycle() {
  if (perfSampleHandler) {
    window.removeEventListener(PERF_SAMPLE_EVENT, perfSampleHandler);
    perfSampleHandler = null;
  }

  if (summaryIntervalId) {
    window.clearInterval(summaryIntervalId);
    summaryIntervalId = null;
  }

  if (visibilityHandler) {
    window.removeEventListener(APP_VISIBILITY_EVENT, visibilityHandler);
    visibilityHandler = null;
  }

  if (screenHandler) {
    window.removeEventListener(SCREEN_CHANGED_EVENT, screenHandler);
    screenHandler = null;
  }

  if (window.ursasPerf) {
    delete window.ursasPerf;
  }

  perfSamples = [];
  visibilityStats = { hiddenCount: 0, visibleCount: 0, lastChangedAt: 0 };
  screenStats = { menu: 0, store: 0, rules: 0, gameplay: 0, gameOver: 0, lastChangedAt: 0 };
}

export { initializePerfStabilizationLifecycle };
