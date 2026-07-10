import { execFileSync } from 'node:child_process';

const MAX_WRITE_ONLY_INSTANCE_FIELDS = 20;
const output = execFileSync('node', ['scripts/report-instance-fields.mjs'], { encoding: 'utf8' });
const lines = output.split('\n').filter((line) => line.startsWith('- js/'));

if (lines.length > MAX_WRITE_ONLY_INSTANCE_FIELDS) {
  console.error(`Write-only instance field budget exceeded: ${lines.length}/${MAX_WRITE_ONLY_INSTANCE_FIELDS}`);
  console.error(output);
  process.exit(1);
}

console.log(`✅ Write-only instance field budget: ${lines.length}/${MAX_WRITE_ONLY_INSTANCE_FIELDS}`);
