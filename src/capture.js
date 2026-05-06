const screenshot = require('screenshot-desktop');
const sharp = require('sharp');
const { detectNavBarFast, validateNavBarHeight } = require('./navbar-detector');
const { CAPTURE } = require('./config');

function findDisplay(displays, bounds) {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return displays.find((d) => cx >= d.left && cx <= d.right && cy >= d.top && cy <= d.bottom) || displays[0];
}

async function captureWindow(bounds, options = {}) {
  const { autoDetectNavBar = true, contentBounds = null, isBrowser = false } = options;

  const displays = await screenshot.listDisplays();
  const display = findDisplay(displays, bounds);

  const dispX = Math.max(0, Math.round(bounds.x - display.left));
  const dispY = Math.max(0, Math.round(bounds.y - display.top));
  const dispW = Math.min(Math.round(bounds.width), display.width - dispX);
  const dispH = Math.min(Math.round(bounds.height), display.height - dispY);

  const imgBuffer = await screenshot({ screen: display.id, format: 'png' });

  let buffer = await sharp(imgBuffer)
    .extract({ left: dispX, top: dispY, width: dispW, height: dispH })
    .toBuffer();

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
    const meta = await sharp(buffer).metadata();
    const newHeight = meta.height - navBarHeight;
    if (newHeight > CAPTURE.MIN_CONTENT_HEIGHT) {
      buffer = await sharp(buffer)
        .extract({ left: 0, top: navBarHeight, width: meta.width, height: newHeight })
        .toBuffer();
    } else {
      navBarHeight = 0;
      navBarDetected = false;
      navBarMethod = 'none-too-small';
    }
  }

  return { buffer, navBarDetected, navBarHeight, navBarMethod, navBarConfidence };
}

module.exports = { captureWindow };
