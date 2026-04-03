const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_RING_METAL_TEXTURE_KEY = 'bezel_metal';
const TUNNEL_RING_METAL_TEXTURE_PATH = 'img/metal_layer_1.png';
const TUNNEL_RING_LIGHT_TEXTURE_KEY = 'bezel_light_primary';
const TUNNEL_RING_LIGHT_TEXTURE_PATH = 'img/light_layer_1.png';
const TUNNEL_RING_LIGHT_SECONDARY_TEXTURE_KEY = 'bezel_light_secondary';
const TUNNEL_RING_LIGHT_SECONDARY_TEXTURE_PATH = 'img/light2_layer_1.png';
const ENERGY_PARTICLE_TEXTURES = Object.freeze([
  { key: 'energy_burst.webp', path: 'img/generated/VFX/energy_burst.webp' },
  { key: 'energy_effect.webp', path: 'img/generated/VFX/energy_effect.webp' },
  { key: 'energy_effect_blob.webp', path: 'img/generated/VFX/energy_effect_blob.webp' },
]);
const EXCLUDED_TEXTURE_KEYS = new Set(['energy_effect.webp']);

const DEFAULT_ROTATION_SPEED = 0;
const BEZEL_SOURCE_WIDTH = 2048;
const BEZEL_SOURCE_HEIGHT = 1365;
const BEZEL_INNER_RADIUS_X = 393;
const BEZEL_INNER_RADIUS_Y = 393;
const BEZEL_FIT_SCALE = 0.96;
const BEZEL_LIGHT_CYCLE_PERIOD_MS = 9000;
const BEZEL_METAL_ALPHA = 1;
const BEZEL_LIGHT_BASE_ALPHA = 0.8;
const BEZEL_LIGHT_PRIMARY_PULSE_AMPLITUDE = 0.08;
const BEZEL_LIGHT_SECONDARY_PULSE_AMPLITUDE = 0.05;

const DEFAULT_VFX_CONFIG = Object.freeze({
  particlesEnabled: true,
  particlesBackCount: 40,
  particlesFrontCount: 54,
  particleSpeedMultiplier: 1,
  glowAlpha: 0.42,
  tieToGameSpeed: true,
  speedMin: 0.01,
  speedMax: 0.25,
});

const PARTICLE_DEPTH_BACK = 30;
const PARTICLE_DEPTH_FRONT = 31;
const PARTICLE_PERIODIC_SWAY_MS = 1200;
const PARTICLE_SPRITE_SCALE_BACK = { start: 0.045, end: 0.012 };
const PARTICLE_SPRITE_SCALE_FRONT = { start: 0.065, end: 0.018 };

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const encodedPath = String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${normalizedBase}${encodedPath}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function getBezelTintColor(cycleRatio) {
  const palette = [
    [30, 60, 255],
    [140, 30, 255],
    [0, 180, 200],
    [200, 0, 180],
    [0, 255, 220],
  ];
  const normalizedRatio = ((cycleRatio % 1) + 1) % 1;
  const palettePosition = normalizedRatio * palette.length;
  const indexA = Math.floor(palettePosition) % palette.length;
  const indexB = (indexA + 1) % palette.length;
  const blend = palettePosition - Math.floor(palettePosition);
  const smoothBlend = blend * blend * (3 - 2 * blend);
  const red = Math.round(lerp(palette[indexA][0], palette[indexB][0], smoothBlend));
  const green = Math.round(lerp(palette[indexA][1], palette[indexB][1], smoothBlend));
  const blue = Math.round(lerp(palette[indexA][2], palette[indexB][2], smoothBlend));
  return (red << 16) | (green << 8) | blue;
}

function getBezelVerticalOffset(viewportHeight) {
  return Math.max(6, Math.round(viewportHeight * 0.012));
}

class TunnelOuterRing {
  static preload(scene) {
    const ringTextures = [
      { key: TUNNEL_RING_METAL_TEXTURE_KEY, path: TUNNEL_RING_METAL_TEXTURE_PATH },
      { key: TUNNEL_RING_LIGHT_TEXTURE_KEY, path: TUNNEL_RING_LIGHT_TEXTURE_PATH },
      { key: TUNNEL_RING_LIGHT_SECONDARY_TEXTURE_KEY, path: TUNNEL_RING_LIGHT_SECONDARY_TEXTURE_PATH },
    ];
    ringTextures.forEach((texture) => {
      if (!scene.textures.exists(texture.key)) {
        scene.load.image(texture.key, assetUrl(texture.path));
      }
    });

    ENERGY_PARTICLE_TEXTURES.forEach((texture) => {
      if (!scene.textures.exists(texture.key)) {
        scene.load.image(texture.key, assetUrl(texture.path));
      }
    });
  }

  constructor(scene, config = {}) {
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5 + getBezelVerticalOffset(scene.scale.height);

    this.scene = scene;
    this.rotationSpeed = DEFAULT_ROTATION_SPEED;
    this.vfxConfig = { ...DEFAULT_VFX_CONFIG, ...config };
    this.speedRatio = 0;
    this.particleAreaRadiusX = BEZEL_INNER_RADIUS_X * 0.67;
    this.particleAreaRadiusY = BEZEL_INNER_RADIUS_Y * 0.52;
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;
    this.baseImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_METAL_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10)
      .setAlpha(BEZEL_METAL_ALPHA);
    this.mainLightBrightImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_LIGHT_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      .setBlendMode('ADD')
      .setAlpha(BEZEL_LIGHT_BASE_ALPHA);
    this.mainLightDimImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_LIGHT_SECONDARY_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      .setBlendMode('ADD')
      .setAlpha(BEZEL_LIGHT_BASE_ALPHA * 0.75);
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];

    this.createParticleLayers(centerX, centerY);
  }

  createParticleAlphaConfig(baseAlpha) {
    return {
      start: clamp(baseAlpha, 0.08, 0.9),
      end: 0,
      ease: 'Quad.easeOut',
    };
  }

  createParticleLayers(centerX, centerY) {
    const particleTextureKeys = ENERGY_PARTICLE_TEXTURES
      .map((texture) => texture.key)
      .filter((textureKey) => this.scene.textures.exists(textureKey))
      .filter((textureKey) => !EXCLUDED_TEXTURE_KEYS.has(textureKey));

    if (!this.vfxConfig.particlesEnabled || particleTextureKeys.length === 0) {
      return;
    }

    const backAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha * 0.52);
    const frontAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha * 0.78);

    const worldY = (ratio) => ({
      min: centerY - this.particleAreaRadiusY * ratio,
      max: centerY + this.particleAreaRadiusY * ratio,
    });

    const spawnX = (particle) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const edge = this.particleAreaRadiusX * (0.22 + Math.random() * 0.38);
      const x = centerX + side * edge;
      if (particle) {
        particle.data = particle.data || {};
        particle.data.dir = side;
      }
      return x;
    };

    const createLayer = (textureKey, alpha, scale, speedMin, speedMax, frequency, lifespan, depth, yRatio) => (
      this.scene.add.particles(0, 0, textureKey, {
        x: { onEmit: spawnX },
        y: worldY(yRatio),
        alpha,
        scale,
        speedX: {
          onEmit: (particle) => {
            const dir = particle?.data?.dir || (particle.x >= centerX ? -1 : 1);
            return dir * (speedMin + Math.random() * (speedMax - speedMin));
          },
        },
        speedY: { min: -10, max: 10 },
        frequency,
        quantity: 1,
        lifespan,
        blendMode: 'ADD',
      }).setDepth(depth)
    );

    const textureCount = particleTextureKeys.length;
    const backRate = Math.max(1, this.vfxConfig.particlesBackCount);
    const frontRate = Math.max(1, this.vfxConfig.particlesFrontCount);
    const perTextureBackFrequency = 1000 / Math.max(1, backRate / textureCount);
    const perTextureFrontFrequency = 1000 / Math.max(1, frontRate / textureCount);

    this.backParticles = particleTextureKeys.map((textureKey) => createLayer(
      textureKey,
      backAlpha,
      PARTICLE_SPRITE_SCALE_BACK,
      10,
      26,
      perTextureBackFrequency,
      { min: 900, max: 1500 },
      PARTICLE_DEPTH_BACK,
      0.82,
    ));

    this.frontParticles = particleTextureKeys.map((textureKey) => createLayer(
      textureKey,
      frontAlpha,
      PARTICLE_SPRITE_SCALE_FRONT,
      16,
      36,
      perTextureFrontFrequency,
      { min: 760, max: 1300 },
      PARTICLE_DEPTH_FRONT,
      0.76,
    ));

    this.backEmitters = [...this.backParticles];
    this.frontEmitters = [...this.frontParticles];
    this.ensureParticlesOnTop();
  }

  ensureParticlesOnTop() {
    [...this.backParticles, ...this.frontParticles].forEach((layer) => {
      if (layer) {
        this.scene.children.bringToTop(layer);
      }
    });
  }

  update() {
    this.baseImage.rotation += this.rotationSpeed;
    this.mainLightBrightImage.rotation += this.rotationSpeed;
    this.mainLightDimImage.rotation += this.rotationSpeed;
    this.ensureParticlesOnTop();
    this.updateLightIntensity();
    this.updateParticleIntensity();
  }

  updateLightIntensity() {
    const speedBoost = this.vfxConfig.tieToGameSpeed ? this.speedRatio : 0;
    const now = this.scene.time.now;
    const tintCycle = (now % BEZEL_LIGHT_CYCLE_PERIOD_MS) / BEZEL_LIGHT_CYCLE_PERIOD_MS;
    const tintColor = getBezelTintColor(tintCycle);
    const pulsePrimary = 0.8 + Math.sin(now * 0.003) * BEZEL_LIGHT_PRIMARY_PULSE_AMPLITUDE + Math.sin(now * 0.0053) * 0.04;
    const pulseSecondary = 0.74 + Math.sin(now * 0.0025 + 0.9) * BEZEL_LIGHT_SECONDARY_PULSE_AMPLITUDE;
    const speedAlphaBoost = speedBoost * 0.16;
    this.mainLightBrightImage.setTint(tintColor);
    this.mainLightDimImage.setTint(tintColor);
    this.mainLightBrightImage.setAlpha(clamp(
      (BEZEL_LIGHT_BASE_ALPHA + speedAlphaBoost) * pulsePrimary,
      0.24,
      1,
    ));
    this.mainLightDimImage.setAlpha(clamp(
      (BEZEL_LIGHT_BASE_ALPHA * 0.72 + speedAlphaBoost * 0.5) * pulseSecondary,
      0.18,
      0.92,
    ));
    this.mainLightBrightImage.setBlendMode('ADD');
    this.mainLightDimImage.setBlendMode('ADD');
  }

  updateParticleIntensity() {
    if (!this.vfxConfig.particlesEnabled) {
      this.backEmitters.forEach((emitter) => emitter?.stop?.());
      this.frontEmitters.forEach((emitter) => emitter?.stop?.());
      return;
    }

    const spawnBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.4 : 1;
    const speedBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.32 : 1;
    const speedMultiplier = this.vfxConfig.particleSpeedMultiplier * speedBoost;
    const pulse = 1 + 0.22 * (0.5 + 0.5 * Math.sin(this.scene.time.now / PARTICLE_PERIODIC_SWAY_MS));

    const safeBackRate = Math.max(1, this.vfxConfig.particlesBackCount * spawnBoost * pulse);
    const safeFrontRate = Math.max(1, this.vfxConfig.particlesFrontCount * spawnBoost * pulse);

    const backEmitterCount = Math.max(1, this.backEmitters.length);
    const frontEmitterCount = Math.max(1, this.frontEmitters.length);
    const backFrequency = 1000 / Math.max(1, safeBackRate / backEmitterCount);
    const frontFrequency = 1000 / Math.max(1, safeFrontRate / frontEmitterCount);

    this.backEmitters.forEach((emitter) => {
      if (!emitter) return;
      emitter.start?.();
      emitter.setFrequency?.(backFrequency);
      emitter.setSpeedX?.({
        onEmit: (particle) => {
          const dir = particle?.data?.dir || (particle.x >= this.particleCenterX ? -1 : 1);
          return dir * randomInRange(10, 26) * speedMultiplier;
        },
      });
      emitter.setSpeedY?.({ min: -12 * speedMultiplier, max: 12 * speedMultiplier });
    });

    this.frontEmitters.forEach((emitter) => {
      if (!emitter) return;
      emitter.start?.();
      emitter.setFrequency?.(frontFrequency);
      emitter.setSpeedX?.({
        onEmit: (particle) => {
          const dir = particle?.data?.dir || (particle.x >= this.particleCenterX ? -1 : 1);
          return dir * randomInRange(16, 36) * speedMultiplier;
        },
      });
      emitter.setSpeedY?.({ min: -14 * speedMultiplier, max: 14 * speedMultiplier });
    });
  }

  applySnapshot(snapshot) {
    const tubeSpeed = snapshot?.tube?.speed;
    if (!Number.isFinite(tubeSpeed)) {
      this.speedRatio = 0;
      return;
    }

    const speedMin = Number.isFinite(this.vfxConfig.speedMin) ? this.vfxConfig.speedMin : 0.01;
    const speedMax = Number.isFinite(this.vfxConfig.speedMax) ? this.vfxConfig.speedMax : 0.25;
    const denominator = Math.max(0.0001, speedMax - speedMin);
    this.speedRatio = clamp((tubeSpeed - speedMin) / denominator, 0, 1);
  }

  setRotationSpeed(speed) {
    if (Number.isFinite(speed)) {
      this.rotationSpeed = speed;
    }
    return this;
  }

  setScale(scale) {
    this.baseImage.setScale(scale);
    this.mainLightBrightImage.setScale(scale);
    this.mainLightDimImage.setScale(scale);
    return this;
  }

  fitToTube(tubeRadius, tubeVerticalScale = 1) {
    if (!Number.isFinite(tubeRadius) || tubeRadius <= 0) {
      return this;
    }

    const tubeRadiusX = tubeRadius;
    const tubeRadiusY = tubeRadius * tubeVerticalScale;
    const targetWidth =
      tubeRadiusX *
      (BEZEL_SOURCE_WIDTH / BEZEL_INNER_RADIUS_X) *
      BEZEL_FIT_SCALE;
    const targetHeight =
      tubeRadiusY *
      (BEZEL_SOURCE_HEIGHT / BEZEL_INNER_RADIUS_Y) *
      BEZEL_FIT_SCALE;

    this.baseImage.setDisplaySize(targetWidth, targetHeight);
    this.mainLightBrightImage.setDisplaySize(targetWidth, targetHeight);
    this.mainLightDimImage.setDisplaySize(targetWidth, targetHeight);

    this.particleAreaRadiusX = tubeRadiusX * 0.95;
    this.particleAreaRadiusY = tubeRadiusY * 0.74;
    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];
    this.createParticleLayers(this.particleCenterX, this.particleCenterY);

    return this;
  }

  resize(width, height) {
    const centerX = width * 0.5;
    const centerY = height * 0.5 + getBezelVerticalOffset(height);
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;
    this.baseImage.setPosition(centerX, centerY);
    this.mainLightBrightImage.setPosition(centerX, centerY);
    this.mainLightDimImage.setPosition(centerX, centerY);

    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];
    this.createParticleLayers(centerX, centerY);

    return this;
  }

  destroy() {
    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.mainLightBrightImage?.destroy();
    this.mainLightDimImage?.destroy();
    this.baseImage?.destroy();
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];
    this.mainLightBrightImage = null;
    this.mainLightDimImage = null;
    this.baseImage = null;
  }
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export { TunnelOuterRing };
