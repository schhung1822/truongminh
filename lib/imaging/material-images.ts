import sharp, { type Metadata } from "sharp";

const ALLOWED = new Set(["jpeg", "png", "webp"]);
export const MAX_MATERIAL_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 2048;

export type ProcessedImage = { buffer: Buffer; ext: "jpg" | "png"; width: number; height: number };

/**
 * Chuẩn hóa ảnh chất liệu upload lên: xoay theo EXIF, giới hạn cạnh dài 2048px.
 * Ảnh có nền trong suốt giữ PNG, còn lại lưu JPEG chất lượng cao.
 * Ném lỗi tiếng Việt nếu file không phải ảnh hợp lệ.
 */
export async function processMaterialImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new Error("File ảnh rỗng.");
  if (input.length > MAX_MATERIAL_IMAGE_BYTES) throw new Error("Ảnh quá lớn (tối đa 15MB).");

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new Error("File không phải ảnh hợp lệ.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) {
    throw new Error("Ảnh chất liệu chỉ nhận PNG, JPG hoặc WEBP.");
  }

  const pipeline = sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });

  if (meta.hasAlpha) {
    const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
    return { buffer: data, ext: "png", width: info.width, height: info.height };
  }
  const { data, info } = await pipeline.jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  return { buffer: data, ext: "jpg", width: info.width, height: info.height };
}

/**
 * Ghép ảnh lớp 1 và lớp 2 đặt cạnh nhau trên nền trắng thành MỘT ảnh tham chiếu (gửi cho AI).
 * Hai ảnh được co về cùng chiều cao trước khi ghép.
 */
export async function composeReference(layer1: Buffer, layer2: Buffer): Promise<ProcessedImage> {
  const HEIGHT = 1024;
  const GAP = 16;

  const prep = async (buf: Buffer) => {
    const { data, info } = await sharp(buf)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ height: HEIGHT, width: 1400, fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };

  const a = await prep(layer1);
  const b = await prep(layer2);
  const width = a.width + GAP + b.width;
  const height = Math.max(a.height, b.height);

  const out = await sharp({
    create: { width, height, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: a.data, left: 0, top: Math.round((height - a.height) / 2) },
      { input: b.data, left: a.width + GAP, top: Math.round((height - b.height) / 2) },
    ])
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });

  return { buffer: out.data, ext: "jpg", width: out.info.width, height: out.info.height };
}
