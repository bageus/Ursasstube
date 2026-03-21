class WebGLTubeBackend {
  constructor(mainCanvas, compositeCtx) {
    this.mainCanvas = mainCanvas;
    this.compositeCtx = compositeCtx;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';
    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    });
    this.ready = false;
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.program = null;
    this.aPosition = -1;
    this.aColor = -1;
    this.devicePixelRatio = 1;

    if (this.gl) {
      this.init();
    }
  }

  init() {
    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, `
      attribute vec2 aPosition;
      attribute vec4 aColor;
      varying vec4 vColor;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vColor = aColor;
      }
    `);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec4 vColor;
      void main() {
        gl_FragColor = vColor;
      }
    `);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('WebGL tube backend link failed:', gl.getProgramInfoLog(program));
      return;
    }

    this.program = program;
    this.aPosition = gl.getAttribLocation(program, 'aPosition');
    this.aColor = gl.getAttribLocation(program, 'aColor');
    this.positionBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.ready = true;
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('WebGL tube backend shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  isSupported() {
    return Boolean(this.ready && this.gl);
  }

  resize({ width, height, dpr = 1 }) {
    if (!this.ready) return;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.devicePixelRatio = dpr;
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  toClipX(x, width) {
    return (x / width) * 2 - 1;
  }

  toClipY(y, height) {
    return 1 - (y / height) * 2;
  }

  pushQuad(positions, colors, quad, width, height, alphaScale = 1) {
    const [x1, y1, x2, y2, x3, y3, x4, y4] = quad.points;
    const { r, g, b } = quad.fillRgb;
    const a = alphaScale;
    const clip = [
      this.toClipX(x1, width), this.toClipY(y1, height),
      this.toClipX(x2, width), this.toClipY(y2, height),
      this.toClipX(x3, width), this.toClipY(y3, height),
      this.toClipX(x4, width), this.toClipY(y4, height)
    ];
    positions.push(
      clip[0], clip[1], clip[2], clip[3], clip[4], clip[5],
      clip[0], clip[1], clip[4], clip[5], clip[6], clip[7]
    );
    for (let i = 0; i < 6; i++) {
      colors.push(r / 255, g / 255, b / 255, a);
    }
  }

  draw(model) {
    if (!this.ready) return false;
    const gl = this.gl;
    const positions = [];
    const colors = [];

    for (const quad of model.quads) {
      this.pushQuad(positions, colors, quad, model.viewport.width, model.viewport.height, 1);
      if (quad.shadowAlpha > 0.01) {
        this.pushQuad(
          positions,
          colors,
          { points: quad.points, fillRgb: { r: 0, g: 0, b: 0 } },
          model.viewport.width,
          model.viewport.height,
          Math.min(1, quad.shadowAlpha)
        );
      }
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);

    this.compositeCtx.drawImage(
      this.canvas,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      0,
      0,
      this.mainCanvas.width / this.devicePixelRatio,
      this.mainCanvas.height / this.devicePixelRatio
    );

    return true;
  }
}

export { WebGLTubeBackend };
