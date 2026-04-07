const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_RING_BASE_TEXTURE_KEY = 'construct_blazer_metal_blazer.webp';
const TUNNEL_RING_BASE_TEXTURE_PATH = 'img/construct blazer/metal-blazer.webp';
const TUNNEL_RING_BRIGHT_MASK_TEXTURE_KEY = 'construct_blazer_metal_mask.webp';
const TUNNEL_RING_BRIGHT_MASK_TEXTURE_PATH = 'img/construct blazer/metal-mask.webp';
const TUNNEL_RING_DIM_MASK_TEXTURE_KEY = 'construct_blazer_metal_mask2.webp';
const TUNNEL_RING_DIM_MASK_TEXTURE_PATH = 'img/construct blazer/metal-mask2.webp';
const TUNNEL_RING_BACK_LIGHT_TEXTURE_KEY = 'construct_blazer_light_back.webp';
const TUNNEL_RING_BACK_LIGHT_TEXTURE_PATH = 'img/construct blazer/light-back.webp';
const TUNNEL_RING_DIM_LIGHT_TEXTURE_KEY = 'construct_blazer_light_small.webp';
const TUNNEL_RING_DIM_LIGHT_TEXTURE_PATH = 'img/construct blazer/light-small.webp';
const TUNNEL_RING_BRIGHT_LIGHT_TEXTURE_KEY = 'construct_blazer_light_full.webp';
const TUNNEL_RING_BRIGHT_LIGHT_TEXTURE_PATH = 'img/construct blazer/light-full.webp';
const TUNNEL_RING_SOFT_LIGHT_TEXTURE_KEY = 'construct_blazer_soft_light.webp';
const TUNNEL_RING_SOFT_LIGHT_TEXTURE_PATH = 'img/construct blazer/soft-light.webp';
const ENERGY_PARTICLE_TEXTURES = Object.freeze([
  { key: 'energy_burst.webp', path: 'img/generated/VFX/energy_burst.webp' },
  { key: 'energy_effect.webp', path: 'img/generated/VFX/energy_effect.webp' },
  { key: 'energy_effect_blob.webp', path: 'img/generated/VFX/energy_effect_blob.webp' },
]);
const EXCLUDED_TEXTURE_KEYS = new Set(['energy_effect.webp']);

const DEFAULT_ROTATION_SPEED = 0;
const TUNNEL_OUTER_RING_SOURCE_WIDTH = 1538;
const TUNNEL_OUTER_RING_SOURCE_HEIGHT = 1324;
const LEGACY_RING_SOURCE_WIDTH = 2048;
const LEGACY_RING_SOURCE_HEIGHT = 1365;
const LEGACY_RING_INNER_RADIUS = 393;
const TUNNEL_OUTER_RING_INNER_RADIUS_X = LEGACY_RING_INNER_RADIUS * (TUNNEL_OUTER_RING_SOURCE_WIDTH / LEGACY_RING_SOURCE_WIDTH);
const TUNNEL_OUTER_RING_INNER_RADIUS_Y = LEGACY_RING_INNER_RADIUS * (TUNNEL_OUTER_RING_SOURCE_HEIGHT / LEGACY_RING_SOURCE_HEIGHT);
const TUNNEL_OUTER_RING_FIT_SCALE = 1.0;
const TUNNEL_OUTER_RING_VERTICAL_OFFSET = 17;
const LIGHT_RING_BASE_ALPHA = 0.9;
const LIGHT_RING_BRIGHT_MASK_ALPHA = 0;
const LIGHT_RING_DIM_MASK_ALPHA = 0;
const LIGHT_RING_BACK_ALPHA = 0;
const LIGHT_RING_MAIN_DIM_ALPHA = 0;
const LIGHT_RING_MAIN_BRIGHT_ALPHA = 0;
const LIGHT_RING_SOFT_ALPHA_MAX = 0;
const LIGHT_RING_TRANSITION_PERIOD_MS = 10000;
const LIGHT_RING_LAYER_CROSSFADE_START = 0.5;

const DEFAULT_VFX_CONFIG = Object.freeze({
  particlesEnabled: false,
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
  return `${normalizedBase}${path}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

class TunnelOuterRing {
  static preload(scene) {
    const ringTextures = [
      { key: TUNNEL_RING_BASE_TEXTURE_KEY, path: TUNNEL_RING_BASE_TEXTURE_PATH },
      { key: TUNNEL_RING_BRIGHT_MASK_TEXTURE_KEY, path: TUNNEL_RING_BRIGHT_MASK_TEXTURE_PATH },
      { key: TUNNEL_RING_DIM_MASK_TEXTURE_KEY, path: TUNNEL_RING_DIM_MASK_TEXTURE_PATH },
      { key: TUNNEL_RING_BACK_LIGHT_TEXTURE_KEY, path: TUNNEL_RING_BACK_LIGHT_TEXTURE_PATH },
      { key: TUNNEL_RING_DIM_LIGHT_TEXTURE_KEY, path: TUNNEL_RING_DIM_LIGHT_TEXTURE_PATH },
      { key: TUNNEL_RING_BRIGHT_LIGHT_TEXTURE_KEY, path: TUNNEL_RING_BRIGHT_LIGHT_TEXTURE_PATH },
      { key: TUNNEL_RING_SOFT_LIGHT_TEXTURE_KEY, path: TUNNEL_RING_SOFT_LIGHT_TEXTURE_PATH },
    ];
    ringTextures.forEach((texture) => {
      if (!scene.textures.exists(texture.key)) {
        scene.load.image(texture.key, assetUrl(texture.path));
      }
    });

    // VFX textures intentionally skipped.
  }

  constructor(scene, config = {}) {
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5 + TUNNEL_OUTER_RING_VERTICAL_OFFSET;

    this.scene = scene;
    this.rotationSpeed = DEFAULT_ROTATION_SPEED;
    this.vfxConfig = { ...DEFAULT_VFX_CONFIG, ...config };
    this.speedRatio = 0;
    this.particleAreaRadiusX = TUNNEL_OUTER_RING_INNER_RADIUS_X * 0.67;
    this.particleAreaRadiusY = TUNNEL_OUTER_RING_INNER_RADIUS_Y * 0.52;
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;
    this.brightBlend = 1;
    this.dimLayerBlend = 0;
    this.baseImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_BASE_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10)
      .setAlpha(LIGHT_RING_BASE_ALPHA);
    this.brightMaskImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_BRIGHT_MASK_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10.5)
      .setAlpha(LIGHT_RING_BRIGHT_MASK_ALPHA);
    this.dimMaskImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_DIM_MASK_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10.5)
      .setAlpha(LIGHT_RING_DIM_MASK_ALPHA);
    this.backLightImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_BACK_LIGHT_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(11)
      .setBlendMode('ADD')
      .setAlpha(LIGHT_RING_BACK_ALPHA);
    this.mainLightBrightImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_BRIGHT_LIGHT_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      .setBlendMode('ADD')
      .setAlpha(LIGHT_RING_MAIN_BRIGHT_ALPHA);
    this.mainLightDimImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_DIM_LIGHT_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      .setBlendMode('ADD')
      .setAlpha(0);
    this.softLightBrightImage = scene.add
      .image(centerX, centerY, TUNNEL_RING_SOFT_LIGHT_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(13)
      .setBlendMode('ADD')
      .setAlpha(LIGHT_RING_SOFT_ALPHA_MAX);
    this.ringImages = [
      this.baseImage,
      this.brightMaskImage,
      this.dimMaskImage,
      this.backLightImage,
      this.mainLightBrightImage,
      this.mainLightDimImage,
      this.softLightBrightImage,
    ];
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
    this.brightMaskImage.rotation += this.rotationSpeed;
    this.dimMaskImage.rotation += this.rotationSpeed;
    this.backLightImage.rotation += this.rotationSpeed;
    this.mainLightBrightImage.rotation += this.rotationSpeed;
    this.mainLightDimImage.rotation += this.rotationSpeed;
    this.softLightBrightImage.rotation += this.rotationSpeed;
    this.ensureParticlesOnTop();
    this.updateLightTransition();
    this.updateLightIntensity();
    this.updateParticleIntensity();
  }

  updateLightTransition() {
    const now = this.scene.time.now;
    const cycle = (now % LIGHT_RING_TRANSITION_PERIOD_MS) / LIGHT_RING_TRANSITION_PERIOD_MS;
    const isBrightToDim = cycle < 0.5;
    const halfCycleProgress = isBrightToDim ? cycle * 2 : (cycle - 0.5) * 2;
    const layerCrossfadeProgress = clamp(
      (halfCycleProgress - LIGHT_RING_LAYER_CROSSFADE_START) / (1 - LIGHT_RING_LAYER_CROSSFADE_START),
      0,
      1,
    );
    const brightBlend = isBrightToDim ? (1 - halfCycleProgress) : halfCycleProgress;
    const dimLayerBlend = isBrightToDim ? layerCrossfadeProgress : (1 - layerCrossfadeProgress);

    this.brightBlend = brightBlend;
    this.dimLayerBlend = dimLayerBlend;
  }

  updateLightIntensity() {
    const speedBoost = this.vfxConfig.tieToGameSpeed ? this.speedRatio : 0;
    const now = this.scene.time.now;
    const ambientPulse = 0.9 + 0.1 * Math.sin(now / 1450);
    const backPulse = 0.92 + 0.08 * Math.sin(now / 1180);
    const maskPulse = 0.96 + 0.04 * Math.sin(now / 1710);
    const brightLayerBlend = 1 - this.dimLayerBlend;
    this.baseImage.setAlpha(LIGHT_RING_BASE_ALPHA);
    this.brightMaskImage.setAlpha(clamp(
      LIGHT_RING_BRIGHT_MASK_ALPHA * brightLayerBlend * maskPulse,
      0,
      0.92,
    ));
    this.dimMaskImage.setAlpha(clamp(
      LIGHT_RING_DIM_MASK_ALPHA * this.dimLayerBlend * maskPulse,
      0,
      0.92,
    ));
    this.backLightImage.setAlpha(clamp((LIGHT_RING_BACK_ALPHA + speedBoost * 0.06) * backPulse, 0.18, 0.5));
    this.mainLightBrightImage.setAlpha(clamp(
      LIGHT_RING_MAIN_BRIGHT_ALPHA * brightLayerBlend * ambientPulse,
      0,
      0.92,
    ));
    this.mainLightDimImage.setAlpha(clamp(
      LIGHT_RING_MAIN_DIM_ALPHA * this.dimLayerBlend * ambientPulse,
      0,
      0.7,
    ));
    this.softLightBrightImage.setAlpha(clamp(
      LIGHT_RING_SOFT_ALPHA_MAX * this.brightBlend * (0.9 + speedBoost * 0.2),
      0,
      LIGHT_RING_SOFT_ALPHA_MAX,
    ));
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
    this.forEachRingImage((image) => image.setScale(scale));
    return this;
  }

  clearParticleLayers() {
    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];
  }

  rebuildParticleLayers(centerX, centerY) {
    this.clearParticleLayers();
    this.createParticleLayers(centerX, centerY);
  }

  forEachRingImage(callback) {
    this.ringImages.forEach((image) => {
      if (image) callback(image);
    });
  }

  fitToTube(tubeRadius, tubeVerticalScale = 1) {
    if (!Number.isFinite(tubeRadius) || tubeRadius <= 0) {
      return this;
    }

    const tubeRadiusX = tubeRadius;
    const tubeRadiusY = tubeRadius * tubeVerticalScale;
    const targetWidth =
      tubeRadiusX *
      (TUNNEL_OUTER_RING_SOURCE_WIDTH / TUNNEL_OUTER_RING_INNER_RADIUS_X) *
      TUNNEL_OUTER_RING_FIT_SCALE;
    const targetHeight =
      tubeRadiusY *
      (TUNNEL_OUTER_RING_SOURCE_HEIGHT / TUNNEL_OUTER_RING_INNER_RADIUS_Y) *
      TUNNEL_OUTER_RING_FIT_SCALE;

    this.forEachRingImage((image) => image.setDisplaySize(targetWidth, targetHeight));

    this.particleAreaRadiusX = tubeRadiusX * 0.95;
    this.particleAreaRadiusY = tubeRadiusY * 0.74;
    this.rebuildParticleLayers(this.particleCenterX, this.particleCenterY);

    return this;
  }

  resize(width, height) {
    const centerX = width * 0.5;
    const centerY = height * 0.5 + TUNNEL_OUTER_RING_VERTICAL_OFFSET;
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;
    this.forEachRingImage((image) => image.setPosition(centerX, centerY));

    this.rebuildParticleLayers(centerX, centerY);

    return this;
  }

  destroy() {
    this.clearParticleLayers();
    this.forEachRingImage((image) => image.destroy());
    this.backLightImage = null;
    this.brightMaskImage = null;
    this.dimMaskImage = null;
    this.mainLightBrightImage = null;
    this.mainLightDimImage = null;
    this.softLightBrightImage = null;
    this.baseImage = null;
    this.ringImages = [];
  }
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export { TunnelOuterRing };
