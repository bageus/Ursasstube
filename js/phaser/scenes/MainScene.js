import { EntityRenderer } from '../entities/EntityRenderer.js';
import { TunnelRenderer } from '../tunnel/TunnelRenderer.js';
import { TunnelOuterRing } from '../tunnel/TunnelOuterRing.js';
import { CONFIG } from '../../config.js';

const MAIN_SCENE_KEY = 'MainScene';

class MainSceneController {
  constructor(scene, Phaser) {
    this.Phaser = Phaser;
    this.scene = scene;
    this.snapshot = null;
    this.background = null;
    this.tunnelRenderer = null;
    this.entityRenderer = null;
    this.tunnelOuterRing = null;
    this.handleResize = this.handleResize.bind(this);
    this.handleUpdate = this.handleUpdate.bind(this);
  }

  init(data) {
    this.snapshot = data?.snapshot || null;
  }

  preload() {
    EntityRenderer.preload(this.scene);
    TunnelRenderer.preload(this.scene);
    TunnelOuterRing.preload(this.scene);
  }

  create() {
    const { width, height } = this.scene.scale;
    this.background = this.scene.add.rectangle(0, 0, width, height, 0x050816).setOrigin(0, 0);

    this.tunnelRenderer = new TunnelRenderer(this.scene);
    this.tunnelRenderer.create();
    this.tunnelOuterRing = new TunnelOuterRing(this.scene, CONFIG.ENERGY_TUBE_VFX)
      .fitToTube(CONFIG.TUBE_RADIUS, CONFIG.PLAYER_OFFSET);
    this.entityRenderer = new EntityRenderer(this.scene);
    this.entityRenderer.create();
    this.tunnelRenderer.applySnapshot(this.snapshot);
    this.entityRenderer.applySnapshot(this.snapshot);
    this.tunnelOuterRing?.applySnapshot(this.snapshot);
    this.scene.scale.on('resize', this.handleResize);
    this.scene.events.on('update', this.handleUpdate);
  }

  handleResize(gameSize) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.tunnelOuterRing?.resize(gameSize.width, gameSize.height);
    this.tunnelRenderer?.resize();
  }

  handleUpdate(time, delta) {
    this.tunnelOuterRing?.update(time, delta);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this.tunnelRenderer?.applySnapshot(this.snapshot);
    this.entityRenderer?.applySnapshot(this.snapshot);
    this.tunnelOuterRing?.applySnapshot(this.snapshot);
  }

  destroy() {
    this.scene.scale.off('resize', this.handleResize);
    this.scene.events.off('update', this.handleUpdate);
    this.tunnelOuterRing?.destroy();
    this.tunnelRenderer?.destroy();
    this.entityRenderer?.destroy();
    this.tunnelOuterRing = null;
    this.tunnelRenderer = null;
    this.entityRenderer = null;
  }
}

function createMainSceneClass(Phaser) {
  return class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: MAIN_SCENE_KEY });
      this.controller = new MainSceneController(this, Phaser);
    }

    init(data) {
      this.controller.init(data);
    }

    preload() {
      this.controller.preload();
    }

    create() {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.controller.destroy();
      });
      this.controller.create();
    }

    applySnapshot(snapshot) {
      this.controller.applySnapshot(snapshot);
    }
  };
}

export { MAIN_SCENE_KEY, createMainSceneClass };
