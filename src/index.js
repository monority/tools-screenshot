const { findWindow, listWindows } = require('./finder');
const { captureWindow } = require('./capture');
const { enhance } = require('./enhance');
const { trimNavBar } = require('./trim');

const BROWSER_PROCESSES = ['firefox', 'chrome', 'msedge', 'opera', 'brave', 'vivaldi', 'arc'];

async function capture({ app, scale = 2, output = './capture.png', trimNav = null } = {}) {
  if (!app) {
    throw new Error('Option "app" is required.');
  }

  const win = findWindow(app);
  if (!win) {
    throw new Error(`No window found matching "${app}". Use --list to see available windows.`);
  }

  const isBrowser = BROWSER_PROCESSES.some((b) => (win.process || '').toLowerCase().includes(b));
  const shouldTrim = trimNav === null ? isBrowser : trimNav;

  let { buffer } = await captureWindow(win);

  let trimmedPx = 0;
  if (shouldTrim) {
    const result = await trimNavBar(buffer);
    buffer = result.buffer;
    trimmedPx = result.trimmed;
  }

  const result = await enhance(buffer, { scale, output });

  return {
    window: {
      title: win.title,
      process: win.process,
    },
    trimmedPx,
    ...result,
  };
}

module.exports = { capture, listWindows };
