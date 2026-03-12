/* ===== ASSET MANAGER ===== */
class AssetManager {
  constructor() {
    this.assets = {};
    this.loading = 0;
    this.loaded = 0;
  }

  async loadAll() {
    return Promise.all([
      this.loadImage('obstacles_1', 'assets/obstacles_1.png'),
      this.loadImage('obstacles_2', 'assets/obstacles_2.png'),
      this.loadImage('obstacles_3', 'assets/obstacles_3.png'),
      this.loadImage('coins_gold', 'assets/coins_gold.png'),
      this.loadImage('coins_silver', 'assets/coins_silver.png'),
      this.loadImage('bonus_shield', 'assets/bonus_shield.png'),
      this.loadImage('bonus_speed', 'assets/bonus_speed.png'),
      this.loadImage('bonus_magnet', 'assets/bonus_magnet.png'),
      this.loadImage('bonus_chkey', 'assets/bonus_chkey.png'),
      this.loadImage('bonus_score_plus', 'assets/bonus_score_plus.png'),
      this.loadImage('bonus_score_minus', 'assets/bonus_score_minus.png'),
      this.loadImage('bonus_recharge', 'assets/bonus_recharge.png'),
      this.loadImage('character_back_idle', 'assets/character_back_idle.png'),
      this.loadImage('character_left_idle', 'assets/character_left_idle.png'),
      this.loadImage('character_right_idle', 'assets/character_right_idle.png'),
      this.loadImage('character_left_swipe', 'assets/character_left_swipe.png'),
      this.loadImage('character_right_swipe', 'assets/character_right_swipe.png'),
      this.loadImage('character_spin', 'assets/character_spin.png'),
      this.loadImage('icon_atlas', 'img/icon_atlas.webp'),
      this.loadImage('bezel_light', 'img/light_layer_1.png'),
      this.loadImage('bezel_metal', 'img/metal_layer_1.png')
    ]);
  }

  loadImage(name, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.assets[name] = img; this.loaded++; resolve(img); };
      img.onerror = () => { console.error(`Failed to load ${name}: ${src}`); this.loaded++; resolve(null); };
      img.src = src;
      this.loading++;
    });
  }

  getAsset(name) { return this.assets[name]; }
  isReady() { return this.loaded === this.loading && this.loading > 0; }
  getProgress() { return this.loading === 0 ? 0 : (this.loaded / this.loading) * 100; }
}

const assetManager = new AssetManager();

