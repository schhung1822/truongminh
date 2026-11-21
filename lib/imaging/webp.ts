import sharp from "sharp";

/** Chất lượng WebP cho ảnh chất liệu và ảnh mockup lưu trên kho. */
export const WEBP_QUALITY = 82;

/** Nén ảnh sang WebP (giữ kênh trong suốt nếu có). Đọc được mọi định dạng sharp hỗ trợ. */
export async function toWebp(input: Buffer, quality = WEBP_QUALITY): Promise<Buffer> {
  return sharp(input).webp({ quality }).toBuffer();
}

/**
 * Đưa ảnh về JPEG cho nơi cần JPEG (tải về cho khách, ZIP, PDF, gửi Zalo). Đã là JPEG thì trả nguyên, không nén lại.
 * Ảnh có kênh trong suốt được đặt lên nền trắng.
 */
export async function toJpeg(input: Buffer, quality = 90): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  if (meta.format === "jpeg") return input;
  return sharp(input).flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer();
}
