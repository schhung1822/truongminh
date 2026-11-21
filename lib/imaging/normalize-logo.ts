import sharp, { type Metadata } from "sharp";
import { MAX_UPLOAD_BYTES } from "@/lib/image-options";

const ALLOWED = new Set(["jpeg", "png", "webp", "svg"]);
const MAX_EDGE = 2048;
export const SMALL_LOGO_EDGE = 500;

export type NormalizedLogo = {
  /** PNG đã chuẩn hóa, cạnh dài tối đa 2048px, giữ nền trong suốt nếu có */
  png: Buffer;
  width: number;
  height: number;
  /** file gốc người dùng tải lên */
  originalExt: "png" | "jpg" | "webp" | "svg";
  /** true nếu cạnh dài của file gốc nhỏ hơn 500px: chất lượng mô phỏng có thể kém */
  tooSmall: boolean;
};

/** Chuẩn hóa logo upload (PNG, JPG, WEBP, SVG; tối đa 15MB). Ném lỗi tiếng Việt khi file không hợp lệ. */
export async function normalizeLogo(input: Buffer): Promise<NormalizedLogo> {
  if (input.length === 0) throw new Error("File logo rỗng.");
  if (input.length > MAX_UPLOAD_BYTES) throw new Error("Logo quá lớn (tối đa 15MB).");

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new Error("File không phải ảnh hợp lệ.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) {
    throw new Error("Logo chỉ nhận PNG, JPG, WEBP hoặc SVG.");
  }

  const isSvg = meta.format === "svg";
  // SVG là vector: vẽ ra ở độ phân giải đủ lớn rồi thu về 2048
  const source = isSvg ? sharp(input, { density: 300 }) : sharp(input);

  let baseW = meta.width ?? 0;
  let baseH = meta.height ?? 0;
  if (isSvg) {
    // kích thước khai báo của SVG thường nhỏ (vd 100x100) nhưng là vector nên không tính là "logo nhỏ"
    baseW = Math.max(baseW, MAX_EDGE);
    baseH = Math.max(baseH, MAX_EDGE);
  }

  const { data, info } = await source
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: !isSvg })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    png: data,
    width: info.width,
    height: info.height,
    originalExt: meta.format === "jpeg" ? "jpg" : (meta.format as "png" | "webp" | "svg"),
    tooSmall: Math.max(baseW, baseH) < SMALL_LOGO_EDGE,
  };
}
