const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { enhance } = require('../src/enhance');

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-win-test-'));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function sourceImage() {
  return sharp({
    create: { width: 100, height: 50, channels: 3, background: { r: 30, g: 60, b: 90 } },
  })
    .png()
    .toBuffer();
}

test('enhance upscales by the requested factor', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'nested', 'capture.png');
    const result = await enhance(await sourceImage(), { scale: 2, output });

    assert.equal(result.originalWidth, 100);
    assert.equal(result.originalHeight, 50);
    assert.equal(result.finalWidth, 200);
    assert.equal(result.finalHeight, 100);
    assert.ok(fs.existsSync(output));
  });
});

test('enhance honours an explicit target width', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'capture.png');
    const result = await enhance(await sourceImage(), { scale: 4, targetWidth: 50, output });

    assert.equal(result.finalWidth, 50);
    assert.equal(result.finalHeight, 25);
  });
});

test('enhance writes jpg and webp based on the output extension', async () => {
  await withTempDir(async (dir) => {
    const buffer = await sourceImage();

    for (const ext of ['jpg', 'webp']) {
      const output = path.join(dir, `capture.${ext}`);
      await enhance(buffer, { scale: 1, output });
      // Read through a buffer: libvips may keep a path-based handle open on
      // Windows, which blocks cleanup of the temporary directory.
      const meta = await sharp(fs.readFileSync(output)).metadata();
      assert.equal(meta.format, ext === 'jpg' ? 'jpeg' : 'webp');
    }
  });
});

test('enhance accepts already-decoded raw pixels', async () => {
  await withTempDir(async (dir) => {
    const raw = { data: Buffer.alloc(100 * 50 * 3, 128), width: 100, height: 50, channels: 3 };
    const output = path.join(dir, 'raw.png');
    const result = await enhance(raw, { scale: 2, output });

    assert.equal(result.originalWidth, 100);
    assert.equal(result.originalHeight, 50);
    assert.equal(result.finalWidth, 200);
    assert.equal(result.finalHeight, 100);
    assert.ok(fs.statSync(output).size > 0);
  });
});

test('enhance rejects a missing output path', async () => {
  await assert.rejects(() => enhance(Buffer.alloc(0), { scale: 2 }), /output/);
});
