const { execFileSync } = require('child_process');
const path = require('path');
const { BROWSER_PROCESSES, CONTENT_CLASSES, FINDER } = require('./config');

const PS1_PATH = path.join(__dirname, 'list-windows.ps1');

// JSON payload consumed by list-windows.ps1 — single source of truth lives in config.js.
const PS_CONFIG = JSON.stringify({
  browsers: BROWSER_PROCESSES,
  contentClasses: CONTENT_CLASSES,
});

/**
 * @param {(file: string, args: string[], options: Record<string, unknown>) => string} [exec]
 */
function runPowerShell(exec = /** @type {any} */ (execFileSync)) {
  return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1_PATH], {
    timeout: FINDER.POWERSHELL_TIMEOUT_MS,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, SW_WINDOW_CONFIG: PS_CONFIG },
  });
}

function parseWindows(raw) {
  const trimmed = raw.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function getWindows(run = runPowerShell) {
  // One retry: the first PowerShell invocation can exceed the timeout on a cold
  // start (Add-Type compiles C# on first run, concurrent PS processes contend).
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseWindows(run());
    } catch (err) {
      lastError = err;
      if (err.code === 'ENOENT') throw new Error('PowerShell not found', { cause: err });
    }
  }
  if (lastError && (lastError.killed || lastError.signal || lastError.code === 'ETIMEDOUT')) {
    throw new Error('Window enumeration timed out. Try again in a moment.');
  }
  const detail = (lastError && lastError.message ? lastError.message : '').split('\n')[0];
  throw new Error(`Window enumeration failed: ${detail}`);
}

function findWindow(appName, run) {
  return matchWindow(getWindows(run), appName);
}

function findWindowById(windowId, run) {
  return matchWindowById(getWindows(run), windowId);
}

function matchWindowById(windows, windowId) {
  if (windowId == null) return null;
  const id = String(windowId);
  return windows.find((w) => String(w.id) === id) || null;
}

function matchWindow(windows, appName) {
  if (typeof appName !== 'string' || !appName.trim()) return null;
  const name = appName.trim().toLowerCase();

  const byProcess = windows.find((w) => (w.process || '').toLowerCase().includes(name));
  if (byProcess) return byProcess;

  // For browsers, never fall back to title matching: a browser tab title would
  // match almost any query (e.g. "fire" hits a page about campfires) and we
  // cannot tell tabs apart anyway.
  const isBrowser = BROWSER_PROCESSES.some((p) => name.includes(p) || (name.length >= 3 && p.includes(name)));
  if (isBrowser) return null;

  const byTitle = windows.find((w) => (w.title || '').toLowerCase().includes(name));
  return byTitle || null;
}

function listWindows(run) {
  return getWindows(run).map((w) => ({
    id: String(w.id),
    title: w.title,
    process: w.process,
    isBrowser: w.isBrowser === true,
  }));
}

module.exports = {
  findWindow,
  findWindowById,
  listWindows,
  getWindows,
  matchWindow,
  matchWindowById,
  parseWindows,
  runPowerShell,
};
