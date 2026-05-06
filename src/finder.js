const { execSync } = require('child_process');
const path = require('path');
const { BROWSER_PROCESSES, CONTENT_CLASSES, FINDER } = require('./config');

const PS1_PATH = path.join(__dirname, 'list-windows.ps1');

function getWindows() {
  try {
    const raw = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${PS1_PATH}"`,
      { timeout: FINDER.POWERSHELL_TIMEOUT_MS, encoding: 'utf8', windowsHide: true }
    );
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('PowerShell not found');
    if (err.code === 'ETIMEDOUT') throw new Error('Window enumeration timed out');
    return [];
  }
}

function findWindow(appName) {
  const windows = getWindows();
  const name = appName.toLowerCase();

  const byProcess = windows.find((w) =>
    (w.process || '').toLowerCase().includes(name)
  );
  if (byProcess) return byProcess;

  const isBrowser = BROWSER_PROCESSES.some((p) => name.includes(p) || p.includes(name));
  if (isBrowser) return null;

  const byTitle = windows.find((w) =>
    (w.title || '').toLowerCase().includes(name)
  );
  return byTitle || null;
}

function listWindows() {
  return getWindows().map((w) => ({ title: w.title, process: w.process }));
}

module.exports = { findWindow, listWindows, getWindows };
