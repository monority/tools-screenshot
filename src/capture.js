const screenshot = require('screenshot-desktop');
const sharp = require('sharp');
const { detectNavBarFast, validateNavBarHeight } = require('./navbar-detector');
const { captureWithPrintWindow } = require('./print-window');
const { CAPTURE } = require('./config');

function overlapArea(bounds, display) {
  const left = Math.max(bounds.x, display.left);
  const top = Math.max(bounds.y, display.top);
  const right = Math.min(bounds.x + bounds.width, display.right);
  const bottom = Math.min(bounds.y + bounds.height, display.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

// Raw pixels are tightly packed, so trimming the top is a plain subarray.
function cropTop(image, rows) {
  return {
    data: image.data.subarray(rows * image.width * image.channels),
    width: image.width,
    height: image.height - rows,
    channels: image.channels,
  };
}

// Pick the display holding the largest part of the window. A center-point test
// misclassifies windows that span two monitors.
function findDisplay(displays, bounds) {
  let best = null;
  let bestArea = 0;
  for (const display of displays) {
    const area = overlapArea(bounds, display);
    if (area > bestArea) {
      best = display;
      bestArea = area;
    }
  }
  return best || displays[0];
}

async function decodeRaw(image) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function captureScreenRegion(bounds) {
  const displays = await screenshot.listDisplays();
  const display = findDisplay(displays, bounds);

  // Window bounds clipped to the target display (window may hang off an edge).
  const winLeft = Math.round(bounds.x - display.left);
  const winTop = Math.round(bounds.y - display.top);
  const dispX = Math.max(0, winLeft);
  const dispY = Math.max(0, winTop);
  const dispW = Math.min(winLeft + Math.round(bounds.width), display.width) - dispX;
  const dispH = Math.min(winTop + Math.round(bounds.height), display.height) - dispY;

  if (dispW < 1 || dispH < 1) {
    throw new Error('Window is not visible on any display — cannot capture.');
  }

  const imgBuffer = await screenshot({ screen: display.id, format: 'png' });

  // Decode the screen capture once, crop the window region and keep raw pixels:
  // navbar detection, trimming and enhancement can then work without re-encoding
  // intermediate PNGs.
  const { data, info } = await sharp(imgBuffer)
    .extract({ left: dispX, top: dispY, width: dispW, height: dispH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function detectAndTrim(buffer, { bounds, autoDetectNavBar, contentBounds, isBrowser }) {
  let navBarHeight = 0;
  let navBarDetected = false;
  let navBarMethod = 'none';
  let navBarConfidence = 0;

  if (!autoDetectNavBar) {
    return { buffer, navBarDetected, navBarHeight, navBarMethod, navBarConfidence };
  }

  // Method A: API-derived navbar height
  let apiNavBarHeight = null;
  if (contentBounds && isBrowser) {
    const h = Math.round(contentBounds.y - bounds.y);
    if (h >= CAPTURE.MIN_API_NAVBAR_HEIGHT && h <= CAPTURE.MAX_API_NAVBAR_HEIGHT) {
      apiNavBarHeight = h;
    }
  }

  // Method B: Pixel-based detection
  const pixelDetection = await detectNavBarFast(buffer);

  // Cross-validation
  if (apiNavBarHeight !== null && pixelDetection.found) {
    const diff = Math.abs(apiNavBarHeight - pixelDetection.navBarHeight);
    if (diff <= CAPTURE.CROSS_VALIDATION_TOLERANCE) {
      navBarHeight = apiNavBarHeight;
      navBarConfidence = Math.min(1, (pixelDetection.confidence + 1) / 2);
      navBarMethod = 'api+pixel-agreed';
      navBarDetected = true;
    } else {
      navBarHeight = Math.max(apiNavBarHeight, pixelDetection.navBarHeight);
      navBarConfidence = 0.7;
      navBarMethod = 'api+pixel-disagree';
      navBarDetected = true;
    }
  } else if (apiNavBarHeight !== null) {
    const validation = await validateNavBarHeight(buffer, apiNavBarHeight);
    navBarHeight = apiNavBarHeight;
    navBarConfidence = validation.confidence;
    navBarMethod = validation.confidence > 0.3 ? 'api-validated' : 'api-unvalidated';
    navBarDetected = validation.confidence > 0.3;
  } else if (pixelDetection.found) {
    navBarHeight = pixelDetection.navBarHeight;
    navBarConfidence = pixelDetection.confidence;
    navBarMethod = `pixel(${pixelDetection.method})`;
    navBarDetected = true;
  }

  // Apply crop
  if (navBarDetected && navBarHeight > 0) {
    const newHeight = buffer.height - navBarHeight;
    if (newHeight > CAPTURE.MIN_CONTENT_HEIGHT) {
      buffer = cropTop(buffer, navBarHeight);
    } else {
      navBarHeight = 0;
      navBarDetected = false;
      navBarMethod = 'none-too-small';
    }
  }

  return { buffer, navBarDetected, navBarHeight, navBarMethod, navBarConfidence };
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} bounds
 * @param {{
 *   autoDetectNavBar?: boolean,
 *   contentBounds?: { x: number, y: number, width: number, height: number } | null,
 *   isBrowser?: boolean,
 *   windowId?: string | number | null,
 *   isForeground?: boolean,
 *   printWindow?: (windowId: string | number) => Promise<{ buffer: Buffer, width: number, height: number }>,
 * }} [options]
 */
async function captureWindow(bounds, options = {}) {
  const {
    autoDetectNavBar = true,
    contentBounds = null,
    isBrowser = false,
    windowId = null,
    isForeground = true,
    printWindow = captureWithPrintWindow,
  } = options;

  if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) {
    throw new Error('Invalid window bounds — cannot capture.');
  }

  let buffer = null;
  let source = 'screen';
  let printWindowWarning = null;

  // Background windows are often occluded. PrintWindow renders the window
  // directly, so try it first when the window is not the foreground window.
  if (windowId != null && isForeground === false) {
    try {
      const captured = await printWindow(windowId);
      buffer = await decodeRaw(captured.buffer);
      source = 'print-window';
    } catch (err) {
      printWindowWarning = err && err.message ? err.message : 'PrintWindow capture failed.';
    }
  }

  if (!buffer) {
    buffer = await captureScreenRegion(bounds);
  }

  const result = await detectAndTrim(buffer, { bounds, autoDetectNavBar, contentBounds, isBrowser });
  return { ...result, source, printWindowWarning };
}

module.exports = { captureWindow, findDisplay, cropTop, decodeRaw, detectAndTrim, captureScreenRegion };
