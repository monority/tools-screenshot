const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the collaborators so the orchestration in src/index.js can be tested
// without PowerShell, a real desktop or image encoding.
const finderPath = require.resolve('../src/finder');
const capturePath = require.resolve('../src/capture');
const enhancePath = require.resolve('../src/enhance');

const calls = { findWindow: [], findWindowById: [], captureWindow: [], enhance: [] };
let windowInfo = null;

// @ts-expect-error -- minimal module stub for the finder
require.cache[finderPath] = {
  id: finderPath,
  filename: finderPath,
  loaded: true,
  exports: {
    findWindow: (app) => {
      calls.findWindow.push(app);
      return windowInfo;
    },
    findWindowById: (id) => {
      calls.findWindowById.push(id);
      return windowInfo;
    },
    listWindows: () => [],
  },
};

// @ts-expect-error -- minimal module stub for the capture pipeline
require.cache[capturePath] = {
  id: capturePath,
  filename: capturePath,
  loaded: true,
  exports: {
    captureWindow: async (bounds, options) => {
      calls.captureWindow.push({ bounds, options });
      return {
        buffer: { data: Buffer.alloc(0), width: 10, height: 10, channels: 3 },
        navBarDetected: true,
        navBarHeight: 40,
        navBarMethod: 'api+pixel-agreed',
        navBarConfidence: 0.656,
        source: options.isForeground ? 'screen' : 'print-window',
        printWindowWarning: null,
      };
    },
  },
};

// @ts-expect-error -- minimal module stub for the encoder
require.cache[enhancePath] = {
  id: enhancePath,
  filename: enhancePath,
  loaded: true,
  exports: {
    enhance: async (buffer, options) => {
      calls.enhance.push({ buffer, options });
      return { originalWidth: 10, originalHeight: 10, finalWidth: 20, finalHeight: 20, output: options.output };
    },
  },
};

const { capture } = require('../src/index');

const BROWSER_WINDOW = {
  id: 12345,
  title: 'Docs — Firefox',
  process: 'firefox',
  x: 100,
  y: 50,
  width: 800,
  height: 600,
  contentX: 100,
  contentY: 140,
  contentWidth: 800,
  contentHeight: 510,
  isBrowser: true,
  isForeground: false,
};

function reset(window = BROWSER_WINDOW) {
  windowInfo = window;
  calls.findWindow.length = 0;
  calls.findWindowById.length = 0;
  calls.captureWindow.length = 0;
  calls.enhance.length = 0;
}

test('capture validates its options', async () => {
  reset();
  await assert.rejects(() => capture({}), /"app" or "windowId" is required/);
  await assert.rejects(() => capture({ app: '   ' }), /"app" or "windowId" is required/);
  await assert.rejects(() => capture({ app: 'firefox', output: '' }), /"output" must be a file path/);
  await assert.rejects(() => capture({ app: 'firefox', scale: 0 }), /"scale" must be a positive number/);
  await assert.rejects(() => capture({ app: 'firefox', width: -5 }), /"width".*positive number/);
  assert.equal(calls.captureWindow.length, 0);
});

test('capture reports missing windows with a targeted message', async () => {
  reset(null);
  await assert.rejects(() => capture({ app: 'firefox' }), /No window found matching "firefox"/);
  await assert.rejects(() => capture({ windowId: '42' }), /No window found with id "42"/);
  assert.deepEqual(calls.findWindow, ['firefox']);
  assert.deepEqual(calls.findWindowById, ['42']);
});

test('capture orchestrates a browser capture with automatic navbar trimming', async () => {
  reset();

  const result = await capture({ app: '  firefox ', scale: 3, output: './out.png' });

  assert.deepEqual(calls.findWindow, ['firefox']);
  assert.equal(calls.captureWindow.length, 1);
  assert.deepEqual(calls.captureWindow[0].bounds, { x: 100, y: 50, width: 800, height: 600 });
  assert.deepEqual(calls.captureWindow[0].options, {
    autoDetectNavBar: true,
    contentBounds: { x: 100, y: 140, width: 800, height: 510 },
    isBrowser: true,
    windowId: 12345,
    isForeground: false,
  });
  assert.deepEqual(calls.enhance[0].options, { scale: 3, output: './out.png', targetWidth: null });

  assert.deepEqual(result.window, {
    id: '12345',
    title: 'Docs — Firefox',
    process: 'firefox',
    isForeground: false,
  });
  assert.equal(result.source, 'print-window');
  assert.equal(result.printWindowWarning, null);
  assert.equal(result.navBarConfidence, 0.66);
  assert.equal(result.trimmedPx, 40);
  assert.equal(result.finalWidth, 20);
});

test('capture only auto-trims browsers and honours trimNav overrides', async () => {
  reset({ ...BROWSER_WINDOW, isBrowser: false });

  await capture({ app: 'code' });
  assert.equal(calls.captureWindow.at(-1).options.autoDetectNavBar, false);

  await capture({ app: 'code', trimNav: true });
  assert.equal(calls.captureWindow.at(-1).options.autoDetectNavBar, true);

  reset();
  await capture({ app: 'firefox', trimNav: false });
  assert.equal(calls.captureWindow.at(-1).options.autoDetectNavBar, false);
});

test('capture targets an exact window id and supports the width alias', async () => {
  reset();

  await capture({ windowId: 777, targetWidth: 1600, scale: 2 });

  assert.deepEqual(calls.findWindowById, [777]);
  assert.equal(calls.enhance[0].options.targetWidth, 1600);
});
