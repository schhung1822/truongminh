import "server-only";
import sharp from "sharp";
import { isPinterestImageUrl } from "./image-url";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

/** Không lấy được ảnh pin; `status` là mã HTTP nên trả cho trình duyệt khi lỗi này xảy ra trong một route. */
export class PinImageError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Tải ảnh gốc của một pin từ CDN của Pinterest và đổi sang JPEG (xoay đúng chiều). Dùng cho nút copy ảnh ở trang
 * Mẫu Pinterest và cho bot gửi pin mới vào nhóm Zalo. Chỉ tải từ CDN chính thức (chống SSRF), tối đa 20MB.
 */
export async function fetchPinJpeg(sourceImageUrl: string): Promise<Buffer> {
  if (!isPinterestImageUrl(sourceImageUrl)) throw new PinImageError("Địa chỉ ảnh Pinterest không hợp lệ.", 502);

  let upstream: Response;
  try {
    upstream = await fetch(sourceImageUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new PinImageError("Không tải được ảnh từ Pinterest.", 502);
  }
  if (!upstream.ok) throw new PinImageError(`Pinterest trả lỗi khi tải ảnh (${upstream.status}).`, 502);
  const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new PinImageError("Ảnh Pinterest quá lớn.", 413);

  const source = Buffer.from(await upstream.arrayBuffer());
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) throw new PinImageError("Ảnh Pinterest rỗng hoặc quá lớn.", 413);
  try {
    return await sharp(source, { limitInputPixels: 80_000_000 }).rotate().jpeg({ quality: 92 }).toBuffer();
  } catch {
    throw new PinImageError("Dữ liệu Pinterest trả về không phải ảnh hợp lệ.", 502);
  }
}
