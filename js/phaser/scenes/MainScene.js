export function createMainScene(Phaser) {
  return class MainScene extends Phaser.Scene {
    constructor() {
      super('MainScene');
      this.externalSnapshot = null;
    }

    create() {
      const { width, height } = this.scale;

      this.background = this.add.rectangle(0, 0, width, height, 0x0a0a15).setOrigin(0, 0);
      this.frame = this.add.rectangle(width / 2, height / 2, Math.max(220, width * 0.68), Math.max(160, height * 0.32))
        .setStrokeStyle(2, 0xc084fc, 0.9)
        .setFillStyle(0x130816, 0.65);
      this.titleText = this.add.text(width / 2, Math.max(32, height * 0.16), 'Phaser runtime active', {
        fontFamily: 'Orbitron, Arial, sans-serif',
        fontSize: '24px',
        color: '#f5d0fe',
        align: 'center'
      }).setOrigin(0.5, 0.5);
      this.infoText = this.add.text(width / 2, height / 2, 'Waiting for render snapshot…', {
        fontFamily: 'Orbitron, Arial, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: Math.max(240, width * 0.7) }
      }).setOrigin(0.5, 0.5);

      this.scale.on('resize', this.handleResize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off('resize', this.handleResize, this);
      });
    }

    setExternalSnapshot(snapshot) {
      this.externalSnapshot = snapshot;
      this.renderSnapshot();
    }

    handleResize(gameSize) {
      const width = gameSize.width;
      const height = gameSize.height;
      this.background.setSize(width, height);
      this.frame.setPosition(width / 2, height / 2).setSize(Math.max(220, width * 0.68), Math.max(160, height * 0.32));
      this.titleText.setPosition(width / 2, Math.max(32, height * 0.16));
      this.infoText.setPosition(width / 2, height / 2).setWordWrapWidth(Math.max(240, width * 0.7));
      this.renderSnapshot();
    }

    renderSnapshot() {
      if (!this.infoText) return;
      const snapshot = this.externalSnapshot;
      if (!snapshot) {
        this.infoText.setText('Waiting for render snapshot…');
        return;
      }

      const lines = [
        `Viewport: ${Math.round(snapshot.viewport.width)}×${Math.round(snapshot.viewport.height)} @ DPR ${snapshot.viewport.dpr.toFixed(2)}`,
        `Distance: ${Math.floor(snapshot.runtime.distance)}m  Score: ${Math.floor(snapshot.runtime.score)}`,
        `Tube rotation: ${snapshot.tube.rotation.toFixed(2)}  Scroll: ${snapshot.tube.scroll.toFixed(2)}`,
        `Curve: ${snapshot.tube.curveAngle.toFixed(2)} / ${snapshot.tube.curveStrength.toFixed(2)}  Speed: ${snapshot.tube.speed.toFixed(3)}`,
        `Player lane: ${snapshot.player.lane}  Spin: ${snapshot.player.spinActive ? 'active' : 'idle'}`,
        `Objects: O${snapshot.obstacles.length} B${snapshot.bonuses.length} C${snapshot.coins.length}`
      ];

      this.infoText.setText(lines.join('\n'));
    }
  };
}
