import sharp from "sharp";
import { geometryFromRgba, type LogoGeometry } from "./contour";

const MAX_EDGE = 512;

/** Đọc ảnh logo (PNG đã chuẩn hóa) và trích hình học: khung bao thật, đường viền, diện tích. Chỉ chạy ở máy chủ. */
export async function loadLogoGeometry(png: Buffer): Promise<LogoGeometry> {
  const { data, info } = await sharp(png)
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return geometryFromRgba(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
}
