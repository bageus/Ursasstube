class MainScene {
  constructor() {
    this.key = 'MainScene';
    this.snapshot = null;
    this.background = null;
    this.statusText = null;
  }

  init(data) {
    this.snapshot = data?.snapshot || null;
  }

  create() {
    const { width, height } = this.scale;
    this.background = this.add.rectangle(0, 0, width, height, 0x0a0a15).setOrigin(0, 0);
    this.statusText = this.add.text(width / 2, height / 2, 'Phaser runtime ready', {
      fontFamily: 'Orbitron, Arial, sans-serif',
      fontSize: '18px',
      color: '#c084fc',
      align: 'center'
    }).setOrigin(0.5);

    this.applySnapshot(this.snapshot);
    this.scale.on('resize', this.handleResize, this);
  }

  handleResize(gameSize) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.statusText?.setPosition(gameSize.width / 2, gameSize.height / 2);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    if (!this.statusText) {
      return;
    }

    const viewport = snapshot?.viewport;
    const backendLabel = snapshot?.backend === 'phaser' ? 'Phaser renderer active' : 'Phaser bridge idle';
    const sizeLabel = viewport ? `${Math.round(viewport.width)}×${Math.round(viewport.height)}` : 'pending viewport';
    this.statusText.setText([backendLabel, sizeLabel].join('\n'));
  }

  destroy() {
    this.scale.off('resize', this.handleResize, this);
  }
}

export { MainScene };
