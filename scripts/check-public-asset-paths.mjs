import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const scanTargets = [
  path.join(rootDir, 'index.html'),
  path.join(rootDir, 'js'),
  path.join(rootDir, 'css')
];

const assetPattern = /(?:['"(]|url\()\s*(?<asset>(?:\/)?(?:assets|img)\/[A-Za-z0-9_./ -]+)\s*(?:['")]|$)/g;
const missing = [];
const scanned = [];

function walk(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      walk(path.join(targetPath, entry));
    }
    return;
  }

  if (!/\.(?:js|css|html)$/u.test(targetPath)) return;

  const relativeFile = path.relative(rootDir, targetPath);
  scanned.push(relativeFile);
  const text = fs.readFileSync(targetPath, 'utf8');

  for (const match of text.matchAll(assetPattern)) {
    const rawAssetPath = match.groups?.asset;
    if (!rawAssetPath) continue;

    const normalizedAssetPath = rawAssetPath.startsWith('/') ? rawAssetPath.slice(1) : rawAssetPath;
    const publicAssetPath = path.join(rootDir, 'public', normalizedAssetPath);
    if (!fs.existsSync(publicAssetPath)) {
      missing.push({
        file: relativeFile,
        asset: rawAssetPath,
        publicAssetPath: path.relative(rootDir, publicAssetPath)
      });
    }
  }
}

for (const target of scanTargets) {
  walk(target);
}

console.log(`Public asset path check scanned ${scanned.length} source files.`);

if (missing.length > 0) {
  console.error('❌ Missing public asset references found:');
  for (const entry of missing) {
    console.error(`- ${entry.file}: ${entry.asset} -> ${entry.publicAssetPath}`);
  }
  process.exitCode = 1;
} else {
  console.log('✅ All referenced /assets and /img paths resolve under public/.');
}
