export {
  VIEWPORT_SYNC_EVENT,
  initializeCoreLifecycle,
  initializeTelegramViewportLifecycle,
  initializeMetaMaskLifecycle,
  initializePingLifecycle,
  subscribeAppVisibilityLifecycle,
  PERF_SAMPLE_EVENT
} from '../runtime-lifecycle.js';

export {
  APP_VISIBILITY_EVENT,
  SCREEN_CHANGED_EVENT,
  SMOKE_STEP_COMPLETED_EVENT
} from '../runtime-events.js';

export function isMobileAudioRuntime() {
  const hasTelegram = Boolean(window?.Telegram?.WebApp);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const narrowViewport = typeof window !== 'undefined' && Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
  return hasTelegram || mobileUa || narrowViewport;
}
