import { TunnelRenderer } from '../tunnel/TunnelRenderer.js';

class MainScene {
  constructor() {
    this.key = 'MainScene';
    this.snapshot = null;
    this.background = null;
    this.tunnelRenderer = null;
  }

  init(data) {
    this.snapshot = data?.snapshot || null;
  }

  create() {
    const { width, height } = this.scale;
    this.background = this.add.rectangle(0, 0, width, height, 0x050816).setOrigin(0, 0);
    this.tunnelRenderer = new TunnelRenderer(this);
    this.tunnelRenderer.create();
    this.tunnelRenderer.applySnapshot(this.snapshot);
    this.scale.on('resize', this.handleResize, this);
  }

  handleResize(gameSize) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.tunnelRenderer?.resize();
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this.tunnelRenderer?.applySnapshot(this.snapshot);
  }

  destroy() {
    this.scale.off('resize', this.handleResize, this);
    this.tunnelRenderer?.destroy();
    this.tunnelRenderer = null;
  }
}

export { MainScene };
