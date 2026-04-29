const { execSync } = require('child_process');
const path = require('path');

const PS1_PATH = path.join(__dirname, 'list-windows.ps1');

function getWindows() {
  try {
    const raw = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${PS1_PATH}"`,
      { timeout: 12000, encoding: 'utf8', windowsHide: true }
    );
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
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

  const byTitle = windows.find((w) =>
    (w.title || '').toLowerCase().includes(name)
  );
  return byTitle || null;
}

function listWindows() {
  return getWindows().map((w) => ({ title: w.title, process: w.process }));
}

module.exports = { findWindow, listWindows };
