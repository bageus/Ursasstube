import { initializePerfStabilizationLifecycle } from '../js/perf-stabilization.js';
import { PERF_SAMPLE_EVENT } from '../js/runtime-events.js';

const SAMPLE_COUNT = 120;

function createWindowLikeTarget() {
  const target = new EventTarget();
  target.setInterval = globalThis.setInterval.bind(globalThis);
  target.clearInterval = globalThis.clearInterval.bind(globalThis);
  target.addEventListener = target.addEventListener.bind(target);
  target.removeEventListener = target.removeEventListener.bind(target);
  target.dispatchEvent = target.dispatchEvent.bind(target);
  return target;
}

function emitSyntheticPerfSamples() {
  const startTs = Date.now();
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const fps = 58 + (i % 5);
    const frameMs = Number((1000 / fps).toFixed(2));
    const pingMs = 70 + (i % 7);
    window.dispatchEvent(new CustomEvent(PERF_SAMPLE_EVENT, {
      detail: {
        timestamp: startTs + i * 16,
        fps,
        pingMs,
        debugStats: { frameMs }
      }
    }));
  }
}

function main() {
  const previousWindow = globalThis.window;
  globalThis.window = createWindowLikeTarget();

  const cleanup = initializePerfStabilizationLifecycle();

  try {
    emitSyntheticPerfSamples();
    const snapshot = window.ursasPerf.simulateSmokeFlow();
    const summary = {
      capturedAt: snapshot.capturedAt,
      sampleCount: snapshot.sampleCount,
      fpsP50: snapshot.kpi.fpsP50,
      fpsP95: snapshot.kpi.fpsP95,
      frameMsP50: snapshot.kpi.frameMsP50,
      frameMsP95: snapshot.kpi.frameMsP95,
      pingMsP50: snapshot.kpi.pingMsP50,
      pingMsP95: snapshot.kpi.pingMsP95,
      smokeCompleted: snapshot.smokeChecklist.completed,
      smokeTotal: snapshot.smokeChecklist.total,
      smokeChecklist: snapshot.smokeChecklist
    };

    console.log('MIG-08 smoke snapshot (synthetic perf + runtime flow):');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    cleanup();
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
}

main();
