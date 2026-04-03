/* ===== SECURITY HELPERS ===== */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeTelegramHandle(value, fallback = 'Ursasstube_bot') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const normalized = raw.startsWith('@') ? raw.slice(1) : raw;
  if (/^[A-Za-z0-9_]{5,32}$/.test(normalized)) {
    return normalized;
  }

  return fallback;
}

export { escapeHtml, sanitizeTelegramHandle };
