import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCurrentEvidenceLocation } from './evidence.ts';
import {
  calculateLaplacianVariance,
  minimumSharpnessScore,
} from './sharpness-score.ts';

function createRgbaImage(width, height, pixelAt) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = pixelAt(x, y);
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function blurRgbaImage(image, width, height) {
  const blurred = new Uint8Array(image.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let total = 0;
        let count = 0;
        for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
          for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            const sampleX = Math.min(width - 1, Math.max(0, x + offsetX));
            const sampleY = Math.min(height - 1, Math.max(0, y + offsetY));
            total += image[(sampleY * width + sampleX) * 4 + channel];
            count += 1;
          }
        }
        blurred[index + channel] = Math.round(total / count);
      }
      blurred[index + 3] = 255;
    }
  }
  return blurred;
}

test('flat images have no measurable edge detail', () => {
  const image = createRgbaImage(16, 16, () => 128);

  assert.equal(calculateLaplacianVariance(image, 16, 16), 0);
});

test('images with strong edges score higher than flat images', () => {
  const image = createRgbaImage(16, 16, (x, y) =>
    (x + y) % 2 === 0 ? 0 : 255,
  );

  assert.ok(
    calculateLaplacianVariance(image, 16, 16) > minimumSharpnessScore,
  );
});

test('blurred images fall below the acceptance threshold', () => {
  const width = 32;
  const height = 32;
  const sharp = createRgbaImage(width, height, (x, y) =>
    (x + y) % 2 === 0 ? 0 : 255,
  );
  const blurred = blurRgbaImage(sharp, width, height);

  const score = calculateLaplacianVariance(blurred, width, height);
  assert.ok(score < minimumSharpnessScore, `blurred score: ${score}`);
});

test('invalid image dimensions are rejected', () => {
  assert.throws(
    () => calculateLaplacianVariance(new Uint8Array(4), 1, 1),
    /suficientes píxeles/,
  );
});

test('locations older than the capture are rejected', () => {
  assert.throws(
    () =>
      validateCurrentEvidenceLocation(
        { latitude: -0.2, longitude: -78.5, timestamp: 124_999 },
        130_001,
      ),
    /no corresponde al momento/,
  );
});

test('fresh coordinates are accepted', () => {
  assert.doesNotThrow(() =>
    validateCurrentEvidenceLocation(
      { latitude: -0.2, longitude: -78.5, timestamp: 125_000 },
      130_000,
    ),
  );
});
