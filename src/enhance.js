const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ENHANCE } = require('./config');

function isRawImage(image) {
  return Boolean(image && Buffer.isBuffer(image.data) && image.width > 0 && image.height > 0 && image.channels > 0);
}

async function enhance(image, options = {}) {
  const { scale = ENHANCE.DEFAULT_SCALE, output, targetWidth } = options;
  if (typeof output !== 'string' || !output) throw new Error('Option "output" must be a file path.');
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Option "scale" must be a positive number.');

  let width;
  let height;
  let pipeline;

  if (isRawImage(image)) {
    width = image.width;
    height = image.height;
    pipeline = sharp(image.data, {
      raw: { width, height, channels: image.channels },
    });
  } else {
    const meta = await sharp(image).metadata();
    if (!meta.width || !meta.height) throw new Error('Unable to read image dimensions.');
    width = meta.width;
    height = meta.height;
    pipeline = sharp(image);
  }

  const finalWidth = Math.max(1, Math.round(targetWidth || width * scale));
  const scaleFactor = finalWidth / width;
  const finalHeight = Math.max(1, Math.round(height * scaleFactor));

  pipeline = pipeline
    .withMetadata({ icc: 'srgb' })
    .resize({ width: finalWidth, height: finalHeight, kernel: 'lanczos3' })
    .sharpen(ENHANCE.SHARPEN);

  const ext = path.extname(output).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    pipeline.jpeg({ quality: ENHANCE.JPEG_QUALITY, chromaSubsampling: ENHANCE.JPEG_CHROMA_SUBSAMPLING });
  } else if (ext === '.webp') {
    pipeline.webp({ quality: ENHANCE.WEBP_QUALITY });
  } else {
    pipeline.png({ compressionLevel: ENHANCE.PNG_COMPRESSION });
  }

  const outBuffer = await pipeline.toBuffer();
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, outBuffer);

  // Output dimensions are known from the resize step; no need to decode the
  // freshly encoded image again.
  return {
    originalWidth: width,
    originalHeight: height,
    finalWidth,
    finalHeight,
    output,
  };
}

module.exports = { enhance };
