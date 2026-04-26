import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_VISIBILITY_EVENT } from '../js/runtime-events.js';

function withLifecycleGlobals({ hidden = false } = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  const win = new EventTarget();
  const doc = new EventTarget();
  let currentHidden = hidden;

  Object.defineProperty(doc, 'hidden', {
    get() {
      return currentHidden;
    },
    set(next) {
      currentHidden = Boolean(next);
    },
    configurable: true
  });

  win.setInterval = globalThis.setInterval.bind(globalThis);
  win.clearInterval = globalThis.clearInterval.bind(globalThis);
  win.setTimeout = globalThis.setTimeout.bind(globalThis);
  win.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  win.addEventListener = win.addEventListener.bind(win);
  win.removeEventListener = win.removeEventListener.bind(win);
  win.dispatchEvent = win.dispatchEvent.bind(win);

  doc.addEventListener = doc.addEventListener.bind(doc);
  doc.removeEventListener = doc.removeEventListener.bind(doc);
  doc.dispatchEvent = doc.dispatchEvent.bind(doc);

  Object.defineProperty(globalThis, 'window', {
    value: win,
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'document', {
    value: doc,
    configurable: true,
    writable: true
  });

  return {
    window: win,
    document: doc,
    setHidden(next) {
      currentHidden = Boolean(next);
    },
    restore() {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;

      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  };
}

test('subscribeAppVisibilityLifecycle emits initial state and reacts to visibility events', async () => {
  const env = withLifecycleGlobals({ hidden: true });
  const { subscribeAppVisibilityLifecycle } = await import('../js/runtime-lifecycle.js');
  const events = [];

  try {
    const unsubscribe = subscribeAppVisibilityLifecycle((value) => events.push(value), { emitInitial: true });

    env.window.dispatchEvent(new CustomEvent(APP_VISIBILITY_EVENT, { detail: { hidden: false } }));
    env.window.dispatchEvent(new CustomEvent(APP_VISIBILITY_EVENT, { detail: { hidden: true } }));
    unsubscribe();

    assert.deepEqual(events, [true, false, true]);
  } finally {
    env.restore();
  }
});

test('initializePingLifecycle schedules measurements and cleanup stops timers', async () => {
  const env = withLifecycleGlobals();
  const { initializePingLifecycle } = await import('../js/runtime-lifecycle.js');
  let calls = 0;

  try {
    const cleanup = initializePingLifecycle({
      shouldMeasureInterval: () => true,
      shouldMeasureInitial: () => true,
      measurePing: () => { calls += 1; }
    });

    await new Promise((resolve) => setTimeout(resolve, 2100));
    assert.equal(calls >= 1, true);

    cleanup();
    const callsAfterCleanup = calls;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(calls, callsAfterCleanup);
  } finally {
    env.restore();
  }
});

test('initializeTelegramViewportLifecycle skips unsupported color calls for Telegram v6.0', async () => {
  const env = withLifecycleGlobals();
  const { initializeTelegramViewportLifecycle } = await import('../js/runtime-lifecycle.js');
  let headerColorCalls = 0;
  let backgroundColorCalls = 0;

  try {
    env.window.Telegram = {
      WebApp: {
        expand() {},
        ready() {},
        onEvent() {},
        isVersionAtLeast: (version) => version !== '6.1',
        setHeaderColor: () => { headerColorCalls += 1; },
        setBackgroundColor: () => { backgroundColorCalls += 1; }
      }
    };

    initializeTelegramViewportLifecycle();

    assert.equal(headerColorCalls, 0);
    assert.equal(backgroundColorCalls, 0);
  } finally {
    env.restore();
  }
});
