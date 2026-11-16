/**
 * Navigation Bar Detector v3
 *
 * Core principle: Find where browser chrome ENDS, not where content starts.
 * Browser UI ends at the URL bar (or last toolbar element).
 *
 * Strategy order:
 *   1a. One long high-density band from row 0 (chrome background reads as
 *       fully lit, e.g. Zen's uniform gray) ending in a sustained drop
 *       = chrome block, cut at the drop
 *   1b. Find the first high-density band (>=0.85, 3-30 rows) followed by
 *       sustained content = URL bar/separator
 *   2. Its end = navbar end
 *   3. Fallbacks: first high band, sustained moderate transition, density jump
 */

const sharp = require('sharp');
const { NAVBAR } = require('./config');

function calcRowStats(data, width, height, channels, step) {
  const stats = [];
  for (let y = 0; y < height; y++) {
    let nonEmpty = 0,
      total = 0;
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * channels;
      const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      if (lum > NAVBAR.LUMINANCE_THRESHOLD) nonEmpty++;
      total++;
    }
    stats.push(nonEmpty / total);
  }
  return stats;
}

async function getRawImageData(image) {
  // Accept either an encoded image buffer or already-decoded raw pixels, so
  // callers that already decoded once do not pay for a second decode.
  if (image && Buffer.isBuffer(image.data) && image.width && image.height && image.channels) {
    return image;
  }
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * Find all sustained high-density bands
 * Returns array of { start, end, avgDensity, length }
 */
function findHighDensityBands(densities, scanLimit, threshold, minLength) {
  const bands = [];
  let start = null;
  for (let y = 0; y < scanLimit; y++) {
    if (densities[y] >= threshold) {
      if (start === null) start = y;
    } else {
      if (start !== null && y - start >= minLength) {
        const slice = densities.slice(start, y);
        bands.push({ start, end: y, avgDensity: slice.reduce((a, b) => a + b, 0) / slice.length, length: y - start });
      }
      start = null;
    }
  }
  // Close last band
  if (start !== null && scanLimit - start >= minLength) {
    const slice = densities.slice(start, scanLimit);
    bands.push({
      start,
      end: scanLimit,
      avgDensity: slice.reduce((a, b) => a + b, 0) / slice.length,
      length: scanLimit - start,
    });
  }
  return bands;
}

/**
 * True when density drops below `floor` and stays there for `rows` consecutive
 * rows anywhere from `fromY` to `scanLimit`.
 */
function hasSustainedLowDensity(densities, fromY, scanLimit, floor, rows) {
  let run = 0;
  for (let y = fromY; y < scanLimit; y++) {
    if (densities[y] <= floor) {
      run++;
      if (run >= rows) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/**
 * Chrome-block strategy: browsers whose chrome background is uniformly above
 * the luminance threshold (e.g. Zen's #323232 gray) read as one long
 * high-density band starting at row 0. Page content then shows up as a
 * sustained density drop. Returns the detection when the shape matches.
 */
function detectChromeBlock(densities, leadBand, scanLimit) {
  const { CHROME_BLOCK_DROP_FLOOR, CHROME_BLOCK_DROP_ROWS } = NAVBAR;

  if (!hasSustainedLowDensity(densities, leadBand.end, scanLimit, CHROME_BLOCK_DROP_FLOOR, CHROME_BLOCK_DROP_ROWS)) {
    return null;
  }

  // Confidence grows with the size of the drop between chrome and content.
  const after = densities.slice(leadBand.end, leadBand.end + CHROME_BLOCK_DROP_ROWS);
  const afterAvg = after.reduce((a, b) => a + b, 0) / after.length;
  const drop = leadBand.avgDensity - afterAvg;
  return {
    found: true,
    navBarHeight: leadBand.end,
    confidence: Math.min(1, 0.6 + drop),
    method: 'chrome-block-end',
  };
}

async function detectNavBarFast(image, options = {}) {
  const {
    minNavHeight = NAVBAR.MIN_NAV_HEIGHT,
    maxNavHeight = NAVBAR.MAX_NAV_HEIGHT,
    sampleStep = NAVBAR.SAMPLE_STEP,
  } = options;

  const { data, width, height, channels } = await getRawImageData(image);
  const densities = calcRowStats(data, width, height, channels, sampleStep);
  const scanLimit = Math.min(height, maxNavHeight + 100);

  // Strategy 1: Find the first high-density band followed by sustained content.
  // This is the URL bar (last element of browser chrome before page content).
  const highBands = findHighDensityBands(densities, scanLimit, NAVBAR.SUSTAINED_HIGH_DENSITY, 3);

  if (highBands.length > 0) {
    // Strategy 1a: chrome block — a long high-density band from the very top
    // whose end is followed by a sustained low-density run.
    const lead = highBands[0];
    if (lead.start === 0 && lead.length >= NAVBAR.CHROME_BLOCK_MIN_ROWS && lead.end <= maxNavHeight) {
      const chromeBlock = detectChromeBlock(densities, lead, scanLimit);
      if (chromeBlock) return chromeBlock;
    }

    // A UI band is a short high-density run; its end marks where chrome stops.
    const uiBands = highBands.filter((b) => b.length < 30);

    for (const band of uiBands) {
      const afterStart = band.end;
      let sustainedAfter = 0;
      for (let y = afterStart; y < Math.min(afterStart + 20, scanLimit); y++) {
        if (densities[y] >= NAVBAR.SUSTAINED_MODERATE_DENSITY) sustainedAfter++;
      }

      if (sustainedAfter >= 10) {
        return {
          found: true,
          navBarHeight: band.end,
          confidence: Math.min(1, band.avgDensity / 2 + 0.3),
          method: 'url-bar-end',
        };
      }
    }

    // Fallback: use the first band's start if it's after minNavHeight
    const firstBand = highBands[0];
    if (firstBand.start > minNavHeight) {
      return { found: true, navBarHeight: firstBand.start, confidence: 0.6, method: 'first-high-band' };
    }
  }

  // Strategy 2: Find first sustained moderate-density transition
  // Only if no high-density bands found
  let streakStart = null;
  let streakCount = 0;
  for (let y = minNavHeight; y < scanLimit; y++) {
    if (densities[y] >= NAVBAR.SUSTAINED_MODERATE_DENSITY) {
      if (streakStart === null) streakStart = y;
      streakCount++;
      if (streakCount >= NAVBAR.SUSTAINED_MODERATE_COUNT) {
        const precedingLen = Math.min(streakStart, NAVBAR.PRECEDING_WINDOW_SIZE);
        const preceding = densities.slice(Math.max(0, streakStart - precedingLen), streakStart);
        if (preceding.length > 0) {
          const avgPreceding = preceding.reduce((a, b) => a + b, 0) / preceding.length;
          if (avgPreceding < NAVBAR.PRECEDING_MAX_AVG || streakStart <= minNavHeight + 5) {
            return {
              found: true,
              navBarHeight: streakStart,
              confidence: Math.min(1, streakCount / 20),
              method: 'sustained-moderate',
            };
          }
        }
      }
    } else {
      streakStart = null;
      streakCount = 0;
    }
  }

  // Strategy 3: Density jump fallback
  let bestJump = null;
  for (let y = minNavHeight; y < scanLimit - 3; y++) {
    const before =
      densities.slice(Math.max(0, y - NAVBAR.DENSITY_JUMP_WINDOW_BEFORE), y).reduce((a, b) => a + b, 0) /
      Math.min(NAVBAR.DENSITY_JUMP_WINDOW_BEFORE, y);
    const after =
      densities.slice(y, Math.min(y + NAVBAR.DENSITY_JUMP_WINDOW_AFTER, scanLimit)).reduce((a, b) => a + b, 0) /
      Math.min(NAVBAR.DENSITY_JUMP_WINDOW_AFTER, scanLimit - y);
    const jump = after - before;
    if (jump > NAVBAR.DENSITY_JUMP_MIN && after > 0.3 && (!bestJump || jump > bestJump.jump)) {
      bestJump = { y, jump, confidence: Math.min(1, jump * 2) };
    }
  }

  if (bestJump) {
    return { found: true, navBarHeight: bestJump.y, confidence: bestJump.confidence, method: 'density-jump' };
  }

  return { found: false, navBarHeight: 0, confidence: 0, method: 'none' };
}

async function validateNavBarHeight(image, proposedHeight) {
  if (proposedHeight < 10) return { valid: false, confidence: 0 };

  const { data, width, height, channels } = await getRawImageData(image);
  if (proposedHeight > height * 0.6) return { valid: false, confidence: 0 };

  const sampleStep = NAVBAR.SAMPLE_STEP;
  const bandSize = Math.min(NAVBAR.VALIDATE_BAND_RATIO, Math.floor(proposedHeight / 2));

  function getVariance(startY, endY) {
    let sum = 0,
      sumSq = 0,
      count = 0;
    for (let y = startY; y < endY; y++) {
      for (let x = 0; x < width; x += sampleStep) {
        const idx = (y * width + x) * channels;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sum += lum;
        sumSq += lum * lum;
        count++;
      }
    }
    if (count === 0) return 0;
    const mean = sum / count;
    return sumSq / count - mean * mean;
  }

  const navVariance = getVariance(Math.max(0, proposedHeight - bandSize), proposedHeight);
  const contentVariance = getVariance(proposedHeight, proposedHeight + bandSize);
  const ratio = contentVariance / (navVariance + 1);
  const confidence = Math.min(1, ratio / 3);

  return { valid: confidence > NAVBAR.VALIDATE_MIN_CONFIDENCE, confidence };
}

module.exports = { detectNavBarFast, validateNavBarHeight };
