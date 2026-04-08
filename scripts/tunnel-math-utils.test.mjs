import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeltaSmoothingFactor } from '../js/phaser/tunnel/tunnel-math-utils.js';

test('getDeltaSmoothingFactor returns expected 60fps interpolation factors', () => {
  const deltaSeconds = 1 / 60;
  const rotationSmoothing = getDeltaSmoothingFactor(16.44, deltaSeconds);
  const scrollSmoothing = getDeltaSmoothingFactor(10.47, deltaSeconds);

  assert.ok(Math.abs(rotationSmoothing - 0.24) < 0.002);
  assert.ok(Math.abs(scrollSmoothing - 0.16) < 0.002);
});

test('getDeltaSmoothingFactor keeps behavior stable across frame rates', () => {
  const k = 16.44;
  const t120 = getDeltaSmoothingFactor(k, 1 / 120);
  const t60 = getDeltaSmoothingFactor(k, 1 / 60);
  const t30 = getDeltaSmoothingFactor(k, 1 / 30);
  const twoFramesAt120 = t120 + (1 - t120) * t120;
  const twoFramesAt60 = t60 + (1 - t60) * t60;

  assert.ok(Math.abs(twoFramesAt120 - t60) < 0.001);
  assert.ok(Math.abs(twoFramesAt60 - t30) < 0.001);
});

test('getDeltaSmoothingFactor guards invalid arguments', () => {
  assert.equal(getDeltaSmoothingFactor(16, 0), 0);
  assert.equal(getDeltaSmoothingFactor(16, -1), 0);
  assert.equal(getDeltaSmoothingFactor(-1, 1 / 60), 1);
  assert.equal(getDeltaSmoothingFactor(Number.NaN, 1 / 60), 1);
});
