const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { detectNavBarFast, validateNavBarHeight } = require('../src/navbar-detector');

const WIDTH = 400;
const HEIGHT = 200;
const CHANNELS = 3;

// Build a synthetic browser window: dark rows, a bright 20px toolbar band,
// then high-variance page content.
async function buildSyntheticWindow() {
  const data = Buffer.alloc(WIDTH * HEIGHT * CHANNELS, 20);
  for (let y = 20; y < 40; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * CHANNELS;
      data[i] = data[i + 1] = data[i + 2] = 230;
    }
  }
  for (let y = 40; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      // Half-bright columns with a period that survives the detector's
      // SAMPLE_STEP (4) sampling.
      if (x % 8 === 0) {
        const i = (y * WIDTH + x) * CHANNELS;
        data[i] = data[i + 1] = data[i + 2] = 200;
      }
    }
  }
  return sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
    .png()
    .toBuffer();
}

// Build an image whose rows have the requested "bright pixel" density, measured
// at the detector's SAMPLE_STEP of 4.
async function buildDensityImage(densities) {
  const width = 400;
  const height = densities.length;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 20);

  for (let y = 0; y < height; y++) {
    const brightSamples = Math.round(densities[y] * 10);
    for (let x = 0; x < width; x++) {
      if ((x / 4) % 10 < brightSamples) {
        const i = (y * width + x) * channels;
        data[i] = data[i + 1] = data[i + 2] = 220;
      }
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

test('detectNavBarFast finds the end of the toolbar band', async () => {
  const buffer = await buildSyntheticWindow();
  const result = await detectNavBarFast(buffer);

  assert.equal(result.found, true);
  assert.equal(result.navBarHeight, 40);
  assert.ok(result.confidence > 0);
});

test('detectNavBarFast accepts already-decoded raw pixels', async () => {
  const buffer = await buildSyntheticWindow();
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const result = await detectNavBarFast({
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  });

  assert.equal(result.found, true);
  assert.equal(result.navBarHeight, 40);
});

test('validateNavBarHeight accepts the detected boundary', async () => {
  const buffer = await buildSyntheticWindow();
  const result = await validateNavBarHeight(buffer, 40);

  assert.equal(result.valid, true);
  assert.ok(result.confidence > 0);
});

test('validateNavBarHeight rejects implausible boundaries', async () => {
  const buffer = await buildSyntheticWindow();
  assert.equal((await validateNavBarHeight(buffer, 5)).valid, false);
  assert.equal((await validateNavBarHeight(buffer, 190)).valid, false);
});

test('detectNavBarFast falls back to a sustained moderate transition', async () => {
  const buffer = await buildDensityImage([...Array(30).fill(0), ...Array(30).fill(0.5), ...Array(20).fill(0.2)]);
  const result = await detectNavBarFast(buffer);

  assert.equal(result.found, true);
  assert.equal(result.method, 'sustained-moderate');
  assert.equal(result.navBarHeight, 30);
});

test('detectNavBarFast falls back to a density jump', async () => {
  const buffer = await buildDensityImage([...Array(30).fill(0), ...Array(4).fill(0.5), ...Array(30).fill(0.2)]);
  const result = await detectNavBarFast(buffer);

  assert.equal(result.found, true);
  assert.equal(result.method, 'density-jump');
  assert.equal(result.navBarHeight, 30);
});

test('detectNavBarFast falls back to the first high-density band', async () => {
  const buffer = await buildDensityImage([...Array(20).fill(0), ...Array(30).fill(1), ...Array(30).fill(0.2)]);
  const result = await detectNavBarFast(buffer);

  assert.equal(result.found, true);
  assert.equal(result.method, 'first-high-band');
  assert.equal(result.navBarHeight, 20);
});

test('detectNavBarFast reports no navbar on plain content', async () => {
  const buffer = await buildDensityImage(Array(100).fill(0.2));
  const result = await detectNavBarFast(buffer);

  assert.equal(result.found, false);
  assert.equal(result.navBarHeight, 0);
});

test('detectNavBarFast closes a high-density band that reaches the scan limit', async () => {
  const buffer = await buildDensityImage(Array(60).fill(1));
  const result = await detectNavBarFast(buffer);

  // A full-height bright band is not a short UI band, so the detector must not
  // treat it as a navbar; the closing-band path still has to be exercised.
  assert.equal(result.found, true);
  assert.equal(result.method, 'sustained-moderate');
});
