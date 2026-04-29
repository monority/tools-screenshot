const sharp = require('sharp');

const SCAN_WIDTH = 200;
const MIN_BAR_HEIGHT = 30;
const MAX_BAR_HEIGHT = 200;
const VARIANCE_THRESHOLD = 18;
const STREAK_NEEDED = 6;

async function detectNavBarHeight(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  const scanW = Math.min(SCAN_WIDTH, width);
  const centerX = Math.floor((width - scanW) / 2);
  const scanH = Math.min(MAX_BAR_HEIGHT, height);

  const raw = await sharp(buffer)
    .extract({ left: centerX, top: 0, width: scanW, height: scanH })
    .removeAlpha()
    .raw()
    .toBuffer();

  let streak = 0;
  for (let y = 0; y < scanH; y++) {
    let sumR = 0, sumG = 0, sumB = 0;
    for (let x = 0; x < scanW; x++) {
      const i = (y * scanW + x) * 3;
      sumR += raw[i]; sumG += raw[i + 1]; sumB += raw[i + 2];
    }
    const avgR = sumR / scanW, avgG = sumG / scanW, avgB = sumB / scanW;
    let variance = 0;
    for (let x = 0; x < scanW; x++) {
      const i = (y * scanW + x) * 3;
      variance += Math.abs(raw[i] - avgR) + Math.abs(raw[i + 1] - avgG) + Math.abs(raw[i + 2] - avgB);
    }
    const rowVariance = variance / scanW;

    if (y >= MIN_BAR_HEIGHT) {
      streak = rowVariance > VARIANCE_THRESHOLD ? streak + 1 : 0;
      if (streak >= STREAK_NEEDED) return Math.max(0, y - STREAK_NEEDED + 1);
    }
  }

  return 0;
}

async function trimNavBar(buffer) {
  const navBarHeight = await detectNavBarHeight(buffer);
  if (navBarHeight <= MIN_BAR_HEIGHT) return { buffer, trimmed: 0 };

  const { width, height } = await sharp(buffer).metadata();
  const trimmed = await sharp(buffer)
    .extract({ left: 0, top: navBarHeight, width, height: height - navBarHeight })
    .toBuffer();

  return { buffer: trimmed, trimmed: navBarHeight };
}

module.exports = { trimNavBar };
