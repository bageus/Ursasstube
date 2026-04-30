import { spawnSync } from 'node:child_process';

const checks = [
  ['test:request', 'npm', ['run', 'test:request']],
  ['check:mobile-perf-gate', 'npm', ['run', 'check:mobile-perf-gate']],
  ['check:observability-gate', 'npm', ['run', 'check:observability-gate']],
  ['check:release-gates', 'npm', ['run', 'check:release-gates']],
  ['check:rollback-gate', 'npm', ['run', 'check:rollback-gate']],
];

const results = [];
for (const [name, cmd, args] of checks) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  results.push({ name, ok, code: r.status ?? 1 });
}

console.log('\nStage B summary:');
for (const item of results) {
  console.log(`${item.ok ? '✅' : '❌'} ${item.name} (exit ${item.code})`);
}

if (results.some((x) => !x.ok)) process.exit(1);
console.log('✅ Stage B passed.');
