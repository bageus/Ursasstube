function sanitizeTelegramHandle(value, fallback = 'Ursasstube_bot') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const normalized = raw.startsWith('@') ? raw.slice(1) : raw;
  if (/^[A-Za-z0-9_]{5,32}$/.test(normalized)) {
    return normalized;
  }

  return fallback;
}

export { sanitizeTelegramHandle };
