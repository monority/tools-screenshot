const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ENHANCE } = require('./config');

async function enhance(buffer, options = {}) {
  const { scale = ENHANCE.DEFAULT_SCALE, output, targetWidth } = options;
  const meta = await sharp(buffer).metadata();

  const finalWidth = targetWidth || Math.round(meta.width * scale);
  const scaleFactor = finalWidth / meta.width;
  const finalHeight = Math.round(meta.height * scaleFactor);

  const pipeline = sharp(buffer)
    .withMetadata({ icc: 'srgb' })
    .resize({
      width: finalWidth,
      height: finalHeight,
      kernel: 'lanczos3',
    })
    .sharpen(ENHANCE.SHARPEN);

  const ext = path.extname(output).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    pipeline.jpeg({ quality: ENHANCE.JPEG_QUALITY, chromaSubsampling: ENHANCE.JPEG_CHROMA_SUBSAMPLING });
  } else if (ext === '.webp') {
    pipeline.webp({ quality: ENHANCE.WEBP_QUALITY || 80 });
  } else {
    pipeline.png({ compressionLevel: ENHANCE.PNG_COMPRESSION });
  }

  const outBuffer = await pipeline.toBuffer();
  const dir = path.dirname(output);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await fs.promises.writeFile(output, outBuffer);

  const outMeta = await sharp(outBuffer).metadata();
  return {
    originalWidth: meta.width,
    originalHeight: meta.height,
    finalWidth: outMeta.width,
    finalHeight: outMeta.height,
    output,
  };
}

module.exports = { enhance };
