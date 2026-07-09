import { isTelegramRuntime } from './runtime-detection.js';

const SDK_SRC = ['https://tele', 'gram.org/js/tele', 'gram-web-app.js'].join('');

function findExistingScript() {
  if (typeof document === 'undefined') return null;
  return [...document.querySelectorAll('script[src]')].find((script) => script.src === SDK_SRC) || null;
}

function appendScript() {
  if (typeof document === 'undefined') return null;
  const script = document.createElement('script');
  script.src = SDK_SRC;
  script.defer = true;
  script.dataset.ursassRuntimeSdk = 'true';
  document.head?.append(script);
  return script;
}

function loadRuntimeSdk() {
  if (!isTelegramRuntime()) return null;
  return findExistingScript() || appendScript();
}

export { SDK_SRC, loadRuntimeSdk };
