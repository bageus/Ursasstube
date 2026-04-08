function toSafeNonNegativeNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return 0;
  return numericValue;
}

function classifyInputFeedback(avgLatencyMs) {
  if (avgLatencyMs <= 120) return 'good';
  if (avgLatencyMs <= 220) return 'ok';
  return 'late';
}

function buildInputFeedbackMetrics({
  inputLatencySumMs = 0,
  inputLatencySampleCount = 0,
} = {}) {
  const latencySumMs = toSafeNonNegativeNumber(inputLatencySumMs);
  const sampleCount = Math.floor(toSafeNonNegativeNumber(inputLatencySampleCount));
  const avgLatencyMs = sampleCount > 0 ? Number((latencySumMs / sampleCount).toFixed(2)) : 0;

  return {
    input_latency_sample_count: sampleCount,
    input_latency_avg_ms: avgLatencyMs,
    input_feedback_bucket: classifyInputFeedback(avgLatencyMs),
  };
}

export { buildInputFeedbackMetrics };
