const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const display = { id: 'DISPLAY1', left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 };
let screenBuffer = null;

// Stub the screen helper so the capture pipeline can be tested without reading
// the real desktop.
const screenshotPath = require.resolve('screenshot-desktop');
const fakeScreenshot = async () => screenBuffer;
fakeScreenshot.listDisplays = async () => [display];
// @ts-expect-error -- minimal module stub for the screen helper
require.cache[screenshotPath] = {
  id: screenshotPath,
  filename: screenshotPath,
  loaded: true,
  exports: fakeScreenshot,
};

const { captureWindow } = require('../src/capture');

const WINDOW = { x: 50, y: 20, width: 300, height: 150 };

async function buildScreen() {
  const width = 400;
  const height = 200;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 10);

  const paint = (x, y, value) => {
    const i = (y * width + x) * channels;
    data[i] = data[i + 1] = data[i + 2] = value;
  };

  for (let y = 0; y < WINDOW.height; y++) {
    for (let x = 0; x < WINDOW.width; x++) {
      const absX = WINDOW.x + x;
      const absY = WINDOW.y + y;
      if (y >= 20 && y < 40)
        paint(absX, absY, 230); // toolbar band
      else if (y >= 40 && x % 8 === 0) paint(absX, absY, 200); // content
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

// The PrintWindow fallback renders the window alone, so its image is exactly
// the window size.
async function buildWindowImage() {
  const width = WINDOW.width;
  const height = WINDOW.height;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 10);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (y >= 20 && y < 40) data[i] = data[i + 1] = data[i + 2] = 230;
      else if (y >= 40 && x % 8 === 0) data[i] = data[i + 1] = data[i + 2] = 200;
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

test('captureWindow crops the window region and trims the toolbar', async () => {
  screenBuffer = await buildScreen();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: true,
    contentBounds: null,
    isBrowser: false,
  });

  assert.equal(result.navBarDetected, true);
  assert.equal(result.navBarHeight, 40);
  assert.equal(result.buffer.width, WINDOW.width);
  assert.equal(result.buffer.height, WINDOW.height - 40);
  assert.equal(result.buffer.data.length, result.buffer.width * result.buffer.height * result.buffer.channels);
});

test('captureWindow skips trimming when disabled', async () => {
  screenBuffer = await buildScreen();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: false,
    contentBounds: null,
    isBrowser: false,
  });

  assert.equal(result.navBarDetected, false);
  assert.equal(result.navBarHeight, 0);
  assert.equal(result.buffer.width, WINDOW.width);
  assert.equal(result.buffer.height, WINDOW.height);
});

test('captureWindow trusts API and pixel detection when they agree', async () => {
  screenBuffer = await buildScreen();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: true,
    contentBounds: { x: WINDOW.x, y: WINDOW.y + 40, width: WINDOW.width, height: WINDOW.height - 40 },
    isBrowser: true,
  });

  assert.equal(result.navBarMethod, 'api+pixel-agreed');
  assert.equal(result.navBarHeight, 40);
});

test('captureWindow keeps the taller boundary when API and pixels disagree', async () => {
  screenBuffer = await buildScreen();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: true,
    contentBounds: { x: WINDOW.x, y: WINDOW.y + 80, width: WINDOW.width, height: WINDOW.height - 80 },
    isBrowser: true,
  });

  assert.equal(result.navBarMethod, 'api+pixel-disagree');
  assert.equal(result.navBarHeight, 80);
  assert.equal(result.navBarConfidence, 0.7);
});

test('captureWindow refuses to trim the window down to nothing', async () => {
  screenBuffer = await buildScreen();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: true,
    contentBounds: { x: WINDOW.x, y: WINDOW.y + 140, width: WINDOW.width, height: 10 },
    isBrowser: true,
  });

  assert.equal(result.navBarDetected, false);
  assert.equal(result.navBarMethod, 'none-too-small');
  assert.equal(result.buffer.height, WINDOW.height);
});

test('captureWindow rejects invalid or off-screen bounds', async () => {
  screenBuffer = await buildScreen();

  await assert.rejects(() => captureWindow({ x: 0, y: 0, width: 0, height: 10 }), /Invalid window bounds/);
  await assert.rejects(
    () => captureWindow({ x: 500, y: 500, width: 100, height: 100 }, { autoDetectNavBar: false }),
    /not visible on any display/,
  );
});

test('captureWindow falls back to API validation when pixels show no navbar', async () => {
  // Uniform screen: the pixel detector finds nothing, so only the API-provided
  // content bounds can drive the navbar decision.
  const width = 400;
  const height = 200;
  screenBuffer = await sharp(Buffer.alloc(width * height * 3, 10), {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: true,
    contentBounds: { x: WINDOW.x, y: WINDOW.y + 40, width: WINDOW.width, height: WINDOW.height - 40 },
    isBrowser: true,
  });

  assert.equal(result.navBarMethod, 'api-unvalidated');
  assert.equal(result.navBarHeight, 40);
  assert.equal(result.navBarDetected, false);
  assert.equal(result.buffer.height, WINDOW.height);
});

test('captureWindow uses PrintWindow for a background window', async () => {
  screenBuffer = await buildScreen();
  const windowImage = await buildWindowImage();
  let requestedId = null;

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: true,
    contentBounds: null,
    isBrowser: false,
    windowId: '12345',
    isForeground: false,
    printWindow: async (id) => {
      requestedId = id;
      return { buffer: windowImage, width: WINDOW.width, height: WINDOW.height };
    },
  });

  assert.equal(requestedId, '12345');
  assert.equal(result.source, 'print-window');
  assert.equal(result.printWindowWarning, null);
  assert.equal(result.buffer.width, WINDOW.width);
  assert.equal(result.buffer.height, WINDOW.height - 40);
});

test('captureWindow falls back to the screen when PrintWindow fails', async () => {
  screenBuffer = await buildScreen();

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: false,
    contentBounds: null,
    isBrowser: false,
    windowId: '12345',
    isForeground: false,
    printWindow: async () => {
      throw new Error('PrintWindow produced a blank image.');
    },
  });

  assert.equal(result.source, 'screen');
  assert.match(result.printWindowWarning, /blank image/);
  assert.equal(result.buffer.width, WINDOW.width);
  assert.equal(result.buffer.height, WINDOW.height);
});

test('captureWindow keeps the screen path for a foreground window', async () => {
  screenBuffer = await buildScreen();
  let called = false;

  const result = await captureWindow(WINDOW, {
    autoDetectNavBar: false,
    windowId: '12345',
    isForeground: true,
    printWindow: async () => {
      called = true;
      throw new Error('should not run');
    },
  });

  assert.equal(called, false);
  assert.equal(result.source, 'screen');
  assert.equal(result.printWindowWarning, null);
});
