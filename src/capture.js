const screenshot = require('screenshot-desktop');
const sharp = require('sharp');

function findDisplay(displays, bounds) {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return displays.find((d) => cx >= d.left && cx <= d.right && cy >= d.top && cy <= d.bottom) || displays[0];
}

async function captureWindow(bounds) {
  const displays = await screenshot.listDisplays();
  const display = findDisplay(displays, bounds);

  const imgBuffer = await screenshot({ screen: display.id, format: 'png' });

  const x = Math.max(0, Math.round(bounds.x - display.left));
  const y = Math.max(0, Math.round(bounds.y - display.top));
  const w = Math.min(Math.round(bounds.width), display.width - x);
  const h = Math.min(Math.round(bounds.height), display.height - y);

  const buffer = await sharp(imgBuffer)
    .extract({ left: x, top: y, width: w, height: h })
    .toBuffer();

  return { buffer };
}

module.exports = { captureWindow };
