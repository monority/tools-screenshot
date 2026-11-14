const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const {
  captureWithPrintWindow,
  inspectCapture,
  isValidWindowId,
  parseStatus,
  runPrintWindow,
} = require('../src/print-window');

async function pngBuffer(width, height, color) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

test('isValidWindowId accepts positive decimal handles only', () => {
  assert.equal(isValidWindowId('123456'), true);
  assert.equal(isValidWindowId(42), true);
  assert.equal(isValidWindowId('0'), false);
  assert.equal(isValidWindowId('-1'), false);
  assert.equal(isValidWindowId('12ab'), false);
  assert.equal(isValidWindowId(''), false);
  assert.equal(isValidWindowId(null), false);
});

test('parseStatus reads the last JSON line and rejects bad payloads', () => {
  assert.deepEqual(parseStatus('{"ok":true,"width":10,"height":20}'), { ok: true, width: 10, height: 20 });
  assert.deepEqual(parseStatus('\uFEFFwarning: something\r\n{"ok":false,"error":"boom"}\r\n'), {
    ok: false,
    error: 'boom',
  });

  assert.throws(() => parseStatus(''), /no status/);
  assert.throws(() => parseStatus('not json'), /invalid status payload/);
  assert.throws(() => parseStatus('null'), /invalid status payload/);
});

test('captureWithPrintWindow returns the rendered window', async () => {
  const png = await pngBuffer(32, 24, { r: 30, g: 120, b: 200 });
  let receivedId = null;
  let receivedPath = null;

  const result = await captureWithPrintWindow('98765', {
    run: (hwnd, outPath) => {
      receivedId = hwnd;
      receivedPath = outPath;
      fs.writeFileSync(outPath, png);
      return JSON.stringify({ ok: true, width: 32, height: 24 });
    },
  });

  assert.equal(receivedId, '98765');
  assert.ok(receivedPath.endsWith('window.png'));
  assert.equal(result.width, 32);
  assert.equal(result.height, 24);
  assert.ok(result.buffer.equals(png));
  // The temporary directory must be removed.
  assert.equal(fs.existsSync(path.dirname(receivedPath)), false);
});

test('captureWithPrintWindow rejects invalid ids before running PowerShell', async () => {
  let called = false;
  await assert.rejects(
    () =>
      captureWithPrintWindow('abc', {
        run: () => {
          called = true;
          return '{}';
        },
      }),
    /Invalid window id/,
  );
  assert.equal(called, false);
});

test('captureWithPrintWindow surfaces status errors and runner failures', async () => {
  await assert.rejects(
    () =>
      captureWithPrintWindow('100', {
        run: () => JSON.stringify({ ok: false, error: 'window is minimized' }),
      }),
    /window is minimized/,
  );

  await assert.rejects(
    () =>
      captureWithPrintWindow('100', {
        run: () => {
          throw new Error('exec failed\nsecond line');
        },
      }),
    /PrintWindow capture failed: exec failed/,
  );
});

test('captureWithPrintWindow rejects missing, empty and blank images', async () => {
  await assert.rejects(() => captureWithPrintWindow('100', { run: () => '{"ok":true}' }), /did not produce an image/);

  await assert.rejects(
    () =>
      captureWithPrintWindow('100', {
        run: (hwnd, outPath) => {
          fs.writeFileSync(outPath, Buffer.alloc(0));
          return '{"ok":true}';
        },
      }),
    /empty image/,
  );

  const black = await pngBuffer(40, 30, { r: 0, g: 0, b: 0 });
  await assert.rejects(
    () =>
      captureWithPrintWindow('100', {
        run: (hwnd, outPath) => {
          fs.writeFileSync(outPath, black);
          return '{"ok":true}';
        },
      }),
    /blank image/,
  );
});

test('inspectCapture accepts a blank white window but rejects a black one', async () => {
  const white = await pngBuffer(20, 10, { r: 255, g: 255, b: 255 });
  const black = await pngBuffer(20, 10, { r: 0, g: 0, b: 0 });

  assert.deepEqual(await inspectCapture(white), { blank: false, width: 20, height: 10 });
  assert.deepEqual(await inspectCapture(black), { blank: true, width: 20, height: 10 });
});

test('inspectCapture accepts a non-uniform bitmap', async () => {
  const width = 4;
  const height = 2;
  const data = Buffer.from([
    0, 0, 0, 200, 200, 200, 0, 0, 0, 200, 200, 200, 0, 0, 0, 200, 200, 200, 0, 0, 0, 200, 200, 200,
  ]);
  const png = await sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();

  assert.deepEqual(await inspectCapture(png), { blank: false, width, height });
});

test('runPrintWindow invokes PowerShell with the expected arguments', () => {
  const calls = [];
  const result = runPrintWindow('12345', 'C:\\tmp\\window.png', (file, args, options) => {
    calls.push({ file, args, options });
    return '{"ok":true}';
  });

  assert.equal(result, '{"ok":true}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'powershell.exe');
  assert.ok(calls[0].args.includes('-Hwnd'));
  assert.ok(calls[0].args.includes('12345'));
  assert.ok(calls[0].args.includes('-OutPath'));
  assert.ok(calls[0].args.includes('C:\\tmp\\window.png'));
  assert.equal(calls[0].options.encoding, 'utf8');
  assert.ok(calls[0].options.timeout > 0);
});
