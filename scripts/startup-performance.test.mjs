import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_TRACK_EVENT } from '../js/analytics.js';

function installCustomEventPolyfill() {
  if (typeof globalThis.CustomEvent === 'function') return () => {};
  class CustomEventPolyfill extends Event {
    constructor(type, params = {}) {
      super(type, params);
      this.detail = params.detail;
    }
  }
  globalThis.CustomEvent = CustomEventPolyfill;
  return () => { delete globalThis.CustomEvent; };
}

function mockBrowserRuntime() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const restoreCustomEvent = installCustomEventPolyfill();
  const target = new EventTarget();
  const classes = new Set(['app-ready', 'telegram-runtime']);
  const leaderboardList = {
    textContent: 'Loading top players',
    children: [{}, {}],
  };

  target.dispatchEvent = target.dispatchEvent.bind(target);
  target.addEventListener = target.addEventListener.bind(target);
  target.removeEventListener = target.removeEventListener.bind(target);
  target.Telegram = { WebApp: { platform: 'ios' } };

  globalThis.window = target;
  globalThis.document = {
    body: {
      classList: {
        contains: (name) => classes.has(name),
      },
    },
    getElementById: (id) => (id === 'startLeaderboardList' ? leaderboardList : null),
    addEventListener: () => {},
  };

  return {
    target,
    restore: () => {
      restoreCustomEvent();
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    },
  };
}

test('startup performance telemetry emits compact tap-to-gameplay payload', async () => {
  const env = mockBrowserRuntime();
  const events = [];
  env.target.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    events.push(event.detail);
  });

  try {
    const mod = await import(`../js/startup-performance.js?t=${Date.now()}`);
    mod.markStartupMilestone('bootstrap_start');
    mod.markStartupMilestone('app_shell_ready');
    mod.markStartupMilestone('auth_ready');
    mod.markStartupMilestone('assets_ready');
    mod.markStartupMilestone('renderer_ready');
    mod.markStartupMilestone('app_ready');
    mod.recordStartGameClick({ source: 'startBtn' });
    mod.markStartupMilestone('first_gameplay_frame');
    mod.markStartupMilestone('simulation_start');

    const snapshot = mod.getStartupPerformanceSnapshot();
    const payload = snapshot.payload;

    assert.equal(payload.runtime, 'telegram');
    assert.equal(payload.platform, 'ios');
    assert.equal(payload.source, 'startbtn');
    assert.equal(payload.renderer_ready_at_click, true);
    assert.equal(payload.leaderboard_preload_state_at_click, 'loading');
    assert.equal(typeof payload.tap_to_first_frame_ms, 'number');
    assert.equal(typeof payload.tap_to_simulation_ms, 'number');
    assert.equal(events.at(-1)?.name, 'startup_performance');
  } finally {
    env.restore();
  }
});
