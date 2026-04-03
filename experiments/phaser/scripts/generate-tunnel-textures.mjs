import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(rootDir, 'public/img/generated');

function wrapSvg({ width, height, content }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${content}</svg>\n`;
}

function createCoreVoid() {
  return wrapSvg({
    width: 1024,
    height: 1024,
    content: `
      <defs>
        <radialGradient id="coreVoidGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#000000" stop-opacity="1"/>
          <stop offset="45%" stop-color="#090414" stop-opacity="0.96"/>
          <stop offset="78%" stop-color="#220a2f" stop-opacity="0.72"/>
          <stop offset="100%" stop-color="#35103f" stop-opacity="0.0"/>
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#coreVoidGradient)"/>
    `
  });
}

function createCoreGlow() {
  return wrapSvg({
    width: 1024,
    height: 1024,
    content: `
      <defs>
        <radialGradient id="coreGlowGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffccff" stop-opacity="0.98"/>
          <stop offset="15%" stop-color="#ff59d6" stop-opacity="0.8"/>
          <stop offset="45%" stop-color="#b432ff" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="#2c0a46" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#coreGlowGradient)"/>
    `
  });
}

function createLightStreak(seed = 1) {
  const color = seed === 1 ? '#ff76e4' : '#6acbff';
  const altColor = seed === 1 ? '#ffb7ff' : '#b9ecff';
  return wrapSvg({
    width: 1024,
    height: 1024,
    content: `
      <defs>
        <linearGradient id="streakMain${seed}" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0"/>
          <stop offset="30%" stop-color="${altColor}" stop-opacity="0.65"/>
          <stop offset="50%" stop-color="#ffffff" stop-opacity="0.9"/>
          <stop offset="70%" stop-color="${altColor}" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g transform="rotate(${seed === 1 ? 28 : -31} 512 512)">
        <rect x="50" y="485" width="924" height="54" rx="27" fill="url(#streakMain${seed})"/>
        <rect x="120" y="505" width="780" height="14" rx="7" fill="#ffffff" opacity="0.55"/>
      </g>
    `
  });
}

function createDustParticle() {
  return wrapSvg({
    width: 128,
    height: 128,
    content: `
      <defs>
        <radialGradient id="dustGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff2fd" stop-opacity="1"/>
          <stop offset="35%" stop-color="#ffb9f6" stop-opacity="0.72"/>
          <stop offset="100%" stop-color="#ff87ef" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="64" cy="64" r="62" fill="url(#dustGradient)"/>
    `
  });
}

function createLensDirt() {
  return wrapSvg({
    width: 1024,
    height: 1024,
    content: `
      <g opacity="0.22" fill="#ffc4ff">
        <circle cx="170" cy="190" r="82"/>
        <circle cx="840" cy="260" r="120"/>
        <circle cx="770" cy="820" r="90"/>
        <circle cx="240" cy="760" r="74"/>
      </g>
      <g opacity="0.12" fill="#ffffff">
        <circle cx="510" cy="130" r="58"/>
        <circle cx="120" cy="560" r="48"/>
        <circle cx="910" cy="560" r="54"/>
      </g>
    `
  });
}

function createRimScratch() {
  const scratches = Array.from({ length: 34 }, (_, idx) => {
    const angle = (idx / 34) * Math.PI * 2;
    const cx = 512 + Math.cos(angle) * 430;
    const cy = 512 + Math.sin(angle) * 430;
    const rotation = (angle * 180) / Math.PI + 90;
    const width = 18 + (idx % 4) * 8;
    return `<rect x="${(cx - width / 2).toFixed(2)}" y="${(cy - 3).toFixed(2)}" width="${width}" height="6" rx="3" fill="#ffd7f8" opacity="0.26" transform="rotate(${rotation.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;
  }).join('');

  return wrapSvg({
    width: 1024,
    height: 1024,
    content: scratches
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const textures = [
    ['core_void.svg', createCoreVoid()],
    ['core_glow.svg', createCoreGlow()],
    ['light_streak_1.svg', createLightStreak(1)],
    ['light_streak_2.svg', createLightStreak(2)],
    ['dust_particle.svg', createDustParticle()],
    ['lens_dirt.svg', createLensDirt()],
    ['rim_scratch.svg', createRimScratch()]
  ];

  await Promise.all(textures.map(([name, content]) => writeFile(resolve(outDir, name), content, 'utf8')));
  console.log(`Generated ${textures.length} tunnel texture assets in ${outDir}`);
}

main().catch((error) => {
  console.error('Failed to generate tunnel textures', error);
  process.exitCode = 1;
});
