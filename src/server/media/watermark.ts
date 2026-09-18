import sharp from "sharp";

// Share of the photo width the logo occupies, and how see-through it is (0 = invisible, 1 = solid).
export const WATERMARK_SCALE = 0.42;
export const WATERMARK_OPACITY = 0.22;

// Builds a centred SVG overlay for sharp().composite(). Height is clamped to the photo so tiny or panoramic
// sources never produce an overlay larger than the canvas (composite would throw).
export async function watermarkOverlay(logo: Buffer, imageWidth: number, imageHeight: number) {
  const logoMetadata = await sharp(logo).metadata();
  const ratio = (logoMetadata.height || 1) / (logoMetadata.width || 1);
  let width = Math.min(imageWidth, Math.max(160, Math.round(imageWidth * WATERMARK_SCALE)));
  let height = Math.max(1, Math.round(width * ratio));
  if (height > imageHeight) { height = imageHeight; width = Math.max(1, Math.round(height / ratio)); }
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${logo.toString("base64")}" width="100%" height="100%" opacity="${WATERMARK_OPACITY}"/></svg>`);
}
