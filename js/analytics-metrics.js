function getEventIdentity(event) {
  return String(
    event?.payload?.wallet
    || event?.payload?.user_id
    || event?.payload?.telegram_id
    || event?.payload?.session_id
    || ''
  ).trim();
}

function getEventDayKey(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toDayIndex(dayKey) {
  if (!dayKey) return null;
  const value = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(value)) return null;
  return Math.floor(value / 86400000);
}

function getSessionDurationSeconds(event) {
  const value = Number(
    event?.payload?.duration_seconds
    ?? event?.payload?.durationSeconds
    ?? event?.payload?.seconds
    ?? 0
  );
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function buildMetricsReport(events = []) {
  const normalizedEvents = Array.isArray(events) ? events : [];

  const sessionEvents = normalizedEvents.filter((event) => event?.name === 'session_length');
  const sessionDurations = sessionEvents.map(getSessionDurationSeconds).filter((value) => value > 0);
  const avgRunTimeSeconds = sessionDurations.length
    ? sessionDurations.reduce((sum, value) => sum + value, 0) / sessionDurations.length
    : 0;

  const startIds = new Set();
  const purchaseIds = new Set();
  for (const event of normalizedEvents) {
    const identity = getEventIdentity(event);
    if (!identity) continue;

    if (event?.name === 'game_start') startIds.add(identity);
    if (event?.name === 'upgrade_purchase') purchaseIds.add(identity);
  }

  const conversion = startIds.size > 0
    ? purchaseIds.size / startIds.size
    : 0;

  const identityDays = new Map();
  for (const event of normalizedEvents) {
    const identity = getEventIdentity(event);
    const dayKey = getEventDayKey(event?.timestamp);
    if (!identity || !dayKey) continue;

    if (!identityDays.has(identity)) identityDays.set(identity, new Set());
    identityDays.get(identity).add(dayKey);
  }

  let d1Retained = 0;
  let d7Retained = 0;
  for (const daySet of identityDays.values()) {
    const dayIndexes = [...daySet].map(toDayIndex).filter((value) => value !== null).sort((a, b) => a - b);
    if (!dayIndexes.length) continue;
    const cohortDay = dayIndexes[0];
    if (dayIndexes.includes(cohortDay + 1)) d1Retained += 1;
    if (dayIndexes.includes(cohortDay + 7)) d7Retained += 1;
  }

  const users = identityDays.size;
  const segmentStats = new Map();
  for (const event of normalizedEvents) {
    if (event?.name !== 'game_end') continue;
    const segment = String(event?.payload?.difficulty_segment || 'unknown').trim() || 'unknown';
    const runDuration = Number(event?.payload?.run_duration || 0);
    if (!segmentStats.has(segment)) {
      segmentStats.set(segment, {
        runs: 0,
        under20s: 0,
        durationSum: 0,
      });
    }

    const stat = segmentStats.get(segment);
    stat.runs += 1;
    if (Number.isFinite(runDuration) && runDuration > 0) {
      stat.durationSum += runDuration;
      if (runDuration < 20) stat.under20s += 1;
    }
  }

  const difficultySegments = {};
  for (const [segment, stat] of segmentStats.entries()) {
    difficultySegments[segment] = {
      runs: stat.runs,
      avgRunDurationSeconds: stat.runs > 0 ? stat.durationSum / stat.runs : 0,
      gameoverUnder20sRate: stat.runs > 0 ? stat.under20s / stat.runs : 0,
    };
  }

  return {
    totalEvents: normalizedEvents.length,
    users,
    avgRunTimeSeconds,
    conversion,
    retentionD1: users > 0 ? d1Retained / users : 0,
    retentionD7: users > 0 ? d7Retained / users : 0,
    difficultySegments,
  };
}

export { buildMetricsReport };
