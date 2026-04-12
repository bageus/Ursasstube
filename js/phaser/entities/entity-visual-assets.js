const VISUAL_UPGRADE_TEXTURES = Object.freeze({
  shadow_contact_ellipse_01: 'shadow_contact_ellipse_01',
  bonus_aura_soft_01: 'bonus_aura_soft_01',
  coin_glint_star_01: 'coin_glint_star_01',
  shock_ring_impact_01: 'shock_ring_impact_01',
});

function drawRadialTexture(scene, key, size, stops) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, size, size);
  const ctx = texture.context;
  const center = size * 0.5;
  const gradient = ctx.createRadialGradient(center, center, size * 0.08, center, center, center);
  stops.forEach((stop) => {
    gradient.addColorStop(stop.offset, stop.color);
  });
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, center, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
}

function drawCoinGlint(scene, key) {
  if (scene.textures.exists(key)) return;
  const size = 128;
  const texture = scene.textures.createCanvas(key, size, size);
  const ctx = texture.context;
  const c = size * 0.5;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c, 14);
  ctx.lineTo(c, size - 14);
  ctx.moveTo(14, c);
  ctx.lineTo(size - 14, c);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,245,255,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(28, 28);
  ctx.lineTo(size - 28, size - 28);
  ctx.moveTo(size - 28, 28);
  ctx.lineTo(28, size - 28);
  ctx.stroke();
  texture.refresh();
}

function drawShadowEllipse(scene, key) {
  if (scene.textures.exists(key)) return;
  const width = 256;
  const height = 128;
  const texture = scene.textures.createCanvas(key, width, height);
  const ctx = texture.context;
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 8, width * 0.5, height * 0.5, width * 0.46);
  gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
  gradient.addColorStop(0.65, 'rgba(0,0,0,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.5, width * 0.46, height * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
}

function ensureVisualUpgradeTextures(scene) {
  drawShadowEllipse(scene, 'shadow_contact_ellipse_01');
  drawRadialTexture(scene, 'bonus_aura_soft_01', 256, [
    { offset: 0, color: 'rgba(255,214,120,0.56)' },
    { offset: 0.45, color: 'rgba(255,169,77,0.28)' },
    { offset: 1, color: 'rgba(255,169,77,0)' },
  ]);
  drawCoinGlint(scene, 'coin_glint_star_01');
  drawRadialTexture(scene, 'shock_ring_impact_01', 512, [
    { offset: 0, color: 'rgba(160,245,255,0.18)' },
    { offset: 0.46, color: 'rgba(160,245,255,0)' },
    { offset: 0.68, color: 'rgba(170,250,255,0.92)' },
    { offset: 0.86, color: 'rgba(210,255,255,0.42)' },
    { offset: 1, color: 'rgba(210,255,255,0)' },
  ]);
}

export { VISUAL_UPGRADE_TEXTURES, ensureVisualUpgradeTextures };
