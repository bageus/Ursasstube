export function formatRemainingHours(endsAt) {
  const ts = typeof endsAt === 'string' ? Date.parse(endsAt) : Number(endsAt);
  if (!Number.isFinite(ts)) return null;
  const ms = ts - Date.now();
  if (ms <= 0) return null;
  return `${Math.max(1, Math.ceil(ms / 3600000))}h`;
}
