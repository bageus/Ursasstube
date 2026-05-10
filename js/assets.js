import { logger } from './logger.js';
/* ===== ASSET MANAGER ===== */
class AssetManager {
  constructor() {
    this.assets = {};
    this.loading = 0;
    this.loaded = 0;
    this._queued = new Set();
  }

  static getCriticalManifest() {
    return [
      ['coin_atlas', 'assets/coin_atlas.webp'],
      ['bonus_atlas', 'assets/bonus_atlas.webp'],
      ['obstacles_atlas', 'assets/obstacles_atlas.webp'],
      ['character_back_idle', 'assets/character_back_idle.png'],
      ['character_left_idle', 'assets/character_left_idle.png'],
      ['character_right_idle', 'assets/character_right_idle.png'],
      ['character_left_swipe', 'assets/character_left_swipe.png'],
      ['character_right_swipe', 'assets/character_right_swipe.png'],
      ['character_spin', 'assets/character_spin.png'],
      ['icon_atlas', 'img/icon_atlas.webp']
    ];
  }

  static getDeferredManifest() {
    return [
      ['bezel_light', ['img/construct blazer/light-full.webp', 'img/construct blazer/light-small.webp']],
      ['bezel_metal', ['img/construct blazer/metal-blazer.webp']]
    ];
  }

  async loadAll() {
   return this.loadCritical();
  }

  async loadCritical() {
    const critical = AssetManager.getCriticalManifest();
    return Promise.all(critical.map(([name, src]) => this.loadImage(name, src)));
  }

  async loadDeferred() {
    const deferred = AssetManager.getDeferredManifest();
    return Promise.all(deferred.map(([name, src]) => this.loadImage(name, src)));
  }

  async loadImageWithFallback(name, sources) {
    for (const src of sources) {
      const loaded = await this.loadImage(name, src, { suppressError: true });
      if (loaded) return loaded;
    }

    const [primary] = sources;
    logger.error(`Failed to load ${name}: ${primary}`);
    return null;
  }

  loadImage(name, src, options = {}) {
    if (Array.isArray(src)) return this.loadImageWithFallback(name, src);

    if (this.assets[name]) return Promise.resolve(this.assets[name]);
    if (this._queued.has(name)) return Promise.resolve(null);

    this._queued.add(name);
    this.loading++;

    return new Promise((resolve) => {
      const img = new Image();
       img.onload = () => {
        this.assets[name] = img;
        this.loaded++;
        this._queued.delete(name);
        resolve(img);
      };
      img.onerror = () => {
        if (!options.suppressError) logger.error(`Failed to load ${name}: ${src}`);
        this.loaded++;
        this._queued.delete(name);
        resolve(null);
      };
      img.src = src;
    });
  }

  getAsset(name) { return this.assets[name]; }
  isReady() { return this.loaded === this.loading && this.loading > 0; }
  getProgress() { return this.loading === 0 ? 0 : (this.loaded / this.loading) * 100; }
}

const assetManager = new AssetManager();


export { assetManager };
