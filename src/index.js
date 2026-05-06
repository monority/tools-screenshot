const { findWindow, listWindows } = require('./finder');
const { captureWindow } = require('./capture');
const { enhance } = require('./enhance');

async function capture({ app, scale = 2, output = './capture.png', trimNav = null, targetWidth } = {}) {
  if (!app) throw new Error('Option "app" is required.');

  const win = findWindow(app);
  if (!win) throw new Error(`No window found matching "${app}". Use --list to see available windows.`);

  const captureBounds = { x: win.x, y: win.y, width: win.width, height: win.height };

  const hasContentBounds = (
    win.contentX != null &&
    win.contentY != null &&
    win.contentWidth > 0 &&
    win.contentHeight > 0
  );
  const contentBounds = hasContentBounds
    ? { x: win.contentX, y: win.contentY, width: win.contentWidth, height: win.contentHeight }
    : null;

  const { buffer, navBarDetected, navBarHeight, navBarMethod, navBarConfidence } = await captureWindow(captureBounds, {
    autoDetectNavBar: trimNav !== false,
    contentBounds,
    isBrowser: win.isBrowser === true,
  });

  const result = await enhance(buffer, { scale, output, targetWidth });

  return {
    window: { title: win.title, process: win.process },
    trimmedPx: navBarHeight,
    navBarDetected,
    navBarHeight,
    navBarMethod,
    navBarConfidence: Math.round(navBarConfidence * 100) / 100,
    ...result,
  };
}

module.exports = { capture, listWindows };
