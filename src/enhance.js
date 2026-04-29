const sharp = require('sharp');
const path = require('path');

async function enhance(buffer, { scale = 2, output = './capture.png' } = {}) {
  const meta = await sharp(buffer).metadata();
  const originalWidth = meta.width;
  const originalHeight = meta.height;

  const targetWidth = Math.round(originalWidth * scale);
  const targetHeight = Math.round(originalHeight * scale);

  const ext = path.extname(output).toLowerCase();
  let pipeline = sharp(buffer, { failOn: 'none' })
    .resize(targetWidth, targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
    })
    .sharpen({ sigma: 0.5, m1: 1.0, m2: 0.2, x1: 2, y2: 8, y3: 16 })
    .withMetadata();

  if (ext === '.jpg' || ext === '.jpeg') {
    pipeline = pipeline.jpeg({ quality: 100, chromaSubsampling: '4:4:4' });
  } else {
    pipeline = pipeline.png({ compressionLevel: 0 });
  }

  await pipeline.toFile(output);

  return {
    originalWidth,
    originalHeight,
    finalWidth: targetWidth,
    finalHeight: targetHeight,
    output,
  };
}

module.exports = { enhance };
