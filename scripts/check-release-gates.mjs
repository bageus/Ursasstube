import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const GATE_REPORTS = Object.freeze([
  { gate: 'security', path: 'docs/security-gate-report-latest.json' },
  { gate: 'mobile-perf', path: 'docs/mobile-perf-gate-report-latest.json' },
  { gate: 'observability-e2e', path: 'docs/observability-gate-report-latest.json' },
  { gate: 'rollback-hotfix', path: 'docs/rollback-gate-report-latest.json' },
]);

function readJson(relativePath) {
  const fullPath = path.resolve(rootDir, relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

function evaluateReleaseGates(reports, readJsonFn = readJson) {
  const results = reports.map(({ gate, path: reportPath }) => {
    const report = readJsonFn(reportPath);
    const status = report?.status === 'approved' ? 'approved' : 'pending';
    const gateMatches = report?.gate === gate;
    return {
      gate,
      reportPath,
      status,
      gateMatches,
      notes: report?.notes || '',
    };
  });

  const pending = results.filter((item) => item.status !== 'approved' || !item.gateMatches);
  return {
    ready: pending.length === 0,
    results,
    pending,
  };
}

function formatSummary(summary) {
  const lines = [];
  lines.push('Release gates status:');
  for (const item of summary.results) {
    const mark = item.status === 'approved' && item.gateMatches ? '✅' : '❌';
    const mismatch = item.gateMatches ? '' : ' (gate mismatch)';
    lines.push(`${mark} ${item.gate} -> ${item.status}${mismatch} [${item.reportPath}]`);
  }
  if (!summary.ready) {
    lines.push('');
    lines.push(`Pending gates: ${summary.pending.length}`);
  }
  return lines.join('\n');
}

function main() {
  const summary = evaluateReleaseGates(GATE_REPORTS);
  console.log(formatSummary(summary));
  if (!summary.ready) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  evaluateReleaseGates,
  formatSummary,
};
