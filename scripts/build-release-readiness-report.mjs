import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateReleaseGates, formatSummary } from './check-release-gates.mjs';

const GATE_REPORTS = Object.freeze([
  { gate: 'security', path: 'docs/security-gate-report-latest.json' },
  { gate: 'mobile-perf', path: 'docs/mobile-perf-gate-report-latest.json' },
  { gate: 'observability-e2e', path: 'docs/observability-gate-report-latest.json' },
  { gate: 'rollback-hotfix', path: 'docs/rollback-gate-report-latest.json' },
]);

async function main() {
  const outputPath = process.argv[2] || 'docs/release-readiness-report-latest.md';
  const summary = evaluateReleaseGates(GATE_REPORTS);
  const lines = [
    '# Release Readiness Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '```',
    formatSummary(summary),
    '```',
    '',
    `Ready for release: ${summary.ready ? 'YES' : 'NO'}`,
  ];

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`✅ Release readiness report written to ${outputPath}`);
}

main().catch((error) => {
  console.error('❌ Failed to build release readiness report:', error);
  process.exitCode = 1;
});
