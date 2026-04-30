import { initializeTelegramViewportLifecycle } from '../../core/runtime.js';
import { logger } from '../../logger.js';

let cleanupTelegramLifecycle = () => {};

function initializeTelegramIntegration() {
  if (!(window.Telegram && window.Telegram.WebApp)) {
    return false;
  }

  cleanupTelegramLifecycle();
  cleanupTelegramLifecycle = initializeTelegramViewportLifecycle();
  logger.info('✅ Telegram Mini App ready');
  return true;
}

export { initializeTelegramIntegration };
