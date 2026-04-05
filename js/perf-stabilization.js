import { logger } from './logger.js';

const PERF_SAMPLE_EVENT = 'ursas:perf-sample';
const PERF_SUMMARY_EVENT = 'ursas:perf-summary';
const MAX_SAMPLES = 180;
const SUMMARY_INTERVAL_MS = 15000;

let summaryIntervalId = null;
let perfSampleHandler = null;
let perfSamples = [];

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
      pingMs: { avg: 0, p50: 0, p95: 0, min: 0, max: 0 }
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
    pingMs: metrics(pingMsValues)
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

  summaryIntervalId = window.setInterval(() => {
    publishSummary();
  }, SUMMARY_INTERVAL_MS);

  window.ursasPerf = {
    getSampleCount: () => perfSamples.length,
    getSummary: () => summarize(perfSamples),
    reset: () => {
      perfSamples = [];
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

  if (window.ursasPerf) {
    delete window.ursasPerf;
  }

  perfSamples = [];
}

export { initializePerfStabilizationLifecycle };
