const { findWindow, findWindowById, listWindows } = require('./finder');
const { captureWindow } = require('./capture');
const { enhance } = require('./enhance');

/**
 * @typedef {Object} CaptureOptions
 * @property {string} [app] Process or window name.
 * @property {string | number} [windowId] Exact window id from listWindows().
 * @property {number} [scale] Upscaling factor.
 * @property {number} [width] Target width in pixels.
 * @property {number} [targetWidth] Deprecated alias for width.
 * @property {string} [output] Output file path.
 * @property {boolean | null} [trimNav] true = force, false = disable, null = auto.
 */

/**
 * @param {CaptureOptions} [options]
 */
async function capture({
  app,
  windowId,
  scale = 2,
  output = './capture.png',
  trimNav = null,
  width,
  targetWidth,
} = {}) {
  if (windowId == null && (typeof app !== 'string' || !app.trim())) {
    throw new Error('Option "app" or "windowId" is required.');
  }
  if (typeof output !== 'string' || !output) throw new Error('Option "output" must be a file path.');
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Option "scale" must be a positive number.');

  // `width` is the documented option; `targetWidth` is kept as an alias.
  const targetWidthPx = width ?? targetWidth ?? null;
  if (targetWidthPx != null && (!Number.isFinite(targetWidthPx) || targetWidthPx <= 0)) {
    throw new Error('Option "width" (or "targetWidth") must be a positive number.');
  }

  const win = windowId != null ? findWindowById(windowId) : findWindow(app.trim());
  if (!win) {
    throw new Error(
      windowId != null
        ? `No window found with id "${windowId}". Use --list to see available windows.`
        : `No window found matching "${app}". Use --list to see available windows.`,
    );
  }

  const captureBounds = { x: win.x, y: win.y, width: win.width, height: win.height };

  const hasContentBounds =
    win.contentX != null && win.contentY != null && win.contentWidth > 0 && win.contentHeight > 0;
  const contentBounds = hasContentBounds
    ? { x: win.contentX, y: win.contentY, width: win.contentWidth, height: win.contentHeight }
    : null;

  // Auto mode: only browsers get navbar trimming. Pixel heuristics on arbitrary
  // apps (terminals, IDEs, games) produce false positives that crop real content.
  const autoDetectNavBar = trimNav === true || (trimNav === null && win.isBrowser === true);

  const { buffer, navBarDetected, navBarHeight, navBarMethod, navBarConfidence, source, printWindowWarning } =
    await captureWindow(captureBounds, {
      autoDetectNavBar,
      contentBounds,
      isBrowser: win.isBrowser === true,
      windowId: win.id,
      isForeground: win.isForeground === true,
    });

  const result = await enhance(buffer, { scale, output, targetWidth: targetWidthPx });

  return {
    window: {
      id: String(win.id),
      title: win.title,
      process: win.process,
      isForeground: win.isForeground === true,
    },
    source,
    printWindowWarning,
    trimmedPx: navBarHeight,
    navBarDetected,
    navBarHeight,
    navBarMethod,
    navBarConfidence: Math.round(navBarConfidence * 100) / 100,
    ...result,
  };
}

module.exports = { capture, listWindows };
