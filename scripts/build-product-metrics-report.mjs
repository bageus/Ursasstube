import fs from 'node:fs/promises';
import path from 'node:path';
import { buildMetricsReport } from '../js/analytics-metrics.js';

function toPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatDifficultySegments(segments = {}) {
  const keys = Object.keys(segments);
  if (keys.length === 0) return '- No game_end difficulty-segment data.\n';
  return keys
    .sort()
    .map((segment) => {
      const item = segments[segment];
      return `- ${segment}: runs=${item.runs}, avg_run=${Number(item.avgRunDurationSeconds || 0).toFixed(2)} sec, gameover_under_20s=${toPercent(item.gameoverUnder20sRate)}`;
    })
    .join('\n') + '\n';
}

async function readEventsFromFile(inputPath) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Input file must contain a JSON array of analytics events.');
  }
  return parsed;
}

async function main() {
  const inputPath = process.argv[2] || 'tmp/analytics-events.json';
  const outputPath = process.argv[3] || 'docs/product-metrics-report-2026-04-07.md';

  const events = await readEventsFromFile(inputPath);
  const metrics = buildMetricsReport(events);

  const report = `# Product Metrics Report\n\n`
    + `Generated at: ${new Date().toISOString()}\n\n`
    + `Input file: \`${inputPath}\`\n\n`
    + `## Core metrics\n`
    + `- Total events: ${metrics.totalEvents}\n`
    + `- Unique users: ${metrics.users}\n`
    + `- Avg run time: ${metrics.avgRunTimeSeconds.toFixed(2)} sec\n`
    + `- Conversion (game_start -> upgrade_purchase): ${toPercent(metrics.conversion)}\n`
    + `- Retention D1: ${toPercent(metrics.retentionD1)}\n`
    + `- Retention D7: ${toPercent(metrics.retentionD7)}\n\n`
    + `## Difficulty segments (A4)\n`
    + formatDifficultySegments(metrics.difficultySegments);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, report, 'utf8');
  console.log(`✅ Metrics report written to ${outputPath}`);
}

main().catch((error) => {
  console.error('❌ Failed to build product metrics report:', error);
  process.exitCode = 1;
});
