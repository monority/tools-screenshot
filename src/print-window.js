const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { PRINT_WINDOW } = require('./config');

const PS1_PATH = path.join(__dirname, 'capture-window.ps1');

/**
 * Window handles are positive decimal integers.
 * @param {string | number} windowId
 */
function isValidWindowId(windowId) {
  return /^[1-9]\d*$/.test(String(windowId ?? ''));
}

/**
 * PowerShell may print warnings before the JSON status line, so parse the last
 * non-empty line.
 * @param {string} raw
 * @returns {{ ok: boolean, width?: number, height?: number, error?: string }}
 */
function parseStatus(raw) {
  const trimmed = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!trimmed) throw new Error('PrintWindow returned no status.');

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '');
  let parsed;
  try {
    parsed = JSON.parse(lines[lines.length - 1]);
  } catch (err) {
    throw new Error('PrintWindow returned an invalid status payload.', { cause: err });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('PrintWindow returned an invalid status payload.');
  }
  return parsed;
}

/**
 * @param {string} hwnd
 * @param {string} outPath
 * @param {(file: string, args: string[], options: Record<string, unknown>) => string} [exec]
 */
function runPrintWindow(hwnd, outPath, exec = /** @type {any} */ (execFileSync)) {
  return exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PS1_PATH,
      '-Hwnd',
      hwnd,
      '-OutPath',
      outPath,
    ],
    {
      timeout: PRINT_WINDOW.TIMEOUT_MS,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
}

/**
 * Detect the uniformly black bitmap that PrintWindow returns for windows it
 * cannot render. A legitimately blank white window is still accepted.
 * @param {Buffer} buffer
 */
async function inspectCapture(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  if (pixelCount === 0) return { blank: true, width: info.width, height: info.height };

  const step = Math.max(1, Math.floor(pixelCount / PRINT_WINDOW.BLANK_SAMPLES));
  let firstLuminance = null;
  let uniform = true;

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const index = pixel * info.channels;
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    if (firstLuminance === null) firstLuminance = luminance;
    else if (Math.abs(luminance - firstLuminance) > 1) {
      uniform = false;
      break;
    }
  }

  const blank = uniform && firstLuminance !== null && firstLuminance < PRINT_WINDOW.BLANK_LUMINANCE;
  return { blank, width: info.width, height: info.height };
}

/**
 * Capture a window through PrintWindow so occluded windows are captured without
 * whatever is drawn on top of them.
 *
 * @param {string | number} windowId
 * @param {{ run?: (hwnd: string, outPath: string) => string }} [options]
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}
 */
async function captureWithPrintWindow(windowId, options = {}) {
  const { run = runPrintWindow } = options;
  if (!isValidWindowId(windowId)) {
    throw new Error(`Invalid window id "${windowId}" — expected a positive decimal handle.`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-screenshot-'));
  const outPath = path.join(dir, 'window.png');

  try {
    let raw;
    try {
      raw = run(String(windowId), outPath);
    } catch (err) {
      const detail = (err && err.message ? err.message : 'unknown error').split('\n')[0];
      throw new Error(`PrintWindow capture failed: ${detail}`, { cause: err });
    }

    const status = parseStatus(raw);
    if (status.ok !== true) {
      throw new Error(`PrintWindow capture failed: ${status.error || 'unknown error'}`);
    }
    if (!fs.existsSync(outPath)) {
      throw new Error('PrintWindow did not produce an image.');
    }

    const buffer = fs.readFileSync(outPath);
    if (buffer.length === 0) {
      throw new Error('PrintWindow produced an empty image.');
    }

    const { blank, width, height } = await inspectCapture(buffer);
    if (blank) {
      throw new Error('PrintWindow produced a blank image.');
    }

    return { buffer, width, height };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

module.exports = {
  captureWithPrintWindow,
  inspectCapture,
  isValidWindowId,
  parseStatus,
  runPrintWindow,
};
