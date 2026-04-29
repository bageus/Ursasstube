const TOAST_ROOT_ID = 'appToastRoot';
const DEFAULT_DURATION_MS = 4200;
const ACTIVE_TOAST_KEYS = new Set();

function ensureToastRoot() {
  if (typeof document === 'undefined') return null;

  let root = document.getElementById(TOAST_ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = TOAST_ROOT_ID;
  root.className = 'toast-stack';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'false');
  document.body.appendChild(root);
  return root;
}

function dismissToast(toast) {
  if (!toast) return;
  const toastKey = toast.getAttribute('data-toast-key');
  if (toastKey) ACTIVE_TOAST_KEYS.delete(toastKey);
  toast.classList.add('toast--leaving');
  setTimeout(() => {
    toast.remove();
  }, 160);
}

function notify(message, options = {}) {
  if (!message) return;

  const root = ensureToastRoot();
  if (!root) return;

  const {
    type = 'info',
    durationMs = DEFAULT_DURATION_MS,
    sticky = false,
    sub = null,
    toastKey = '',
  } = options;

  const normalizedToastKey = String(toastKey || '').trim();
  if (normalizedToastKey && ACTIVE_TOAST_KEYS.has(normalizedToastKey)) return;

  const toast = document.createElement('div');
  const toastType = type === 'warn' ? 'error' : type;
  toast.className = `toast toast--${toastType}`;
  if (normalizedToastKey) {
    toast.setAttribute('data-toast-key', normalizedToastKey);
    ACTIVE_TOAST_KEYS.add(normalizedToastKey);
  }
  toast.textContent = String(message);

  if (sub) {
    const subEl = document.createElement('div');
    subEl.textContent = String(sub);
    subEl.style.cssText = 'margin-top:4px;opacity:0.7;font-size:10px;';
    toast.appendChild(subEl);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'payment-secondary-btn toast-dismiss-btn';
  closeBtn.setAttribute('aria-label', 'Close notification');
  closeBtn.textContent = 'Dismiss';
  closeBtn.addEventListener('click', () => dismissToast(toast));
  toast.appendChild(closeBtn);

  root.appendChild(toast);

  if (!sticky) {
    const timeout = Math.max(1200, Number(durationMs) || DEFAULT_DURATION_MS);
    setTimeout(() => dismissToast(toast), timeout);
  }
}

function notifySuccess(message, options = {}) {
  notify(message, { ...options, type: 'success' });
}

function notifyWarn(message, options = {}) {
  notify(message, { ...options, type: 'warn' });
}

function notifyError(message, options = {}) {
  notify(message, { ...options, type: 'error' });
}

export {
  notifySuccess,
  notifyWarn,
  notifyError,
};
