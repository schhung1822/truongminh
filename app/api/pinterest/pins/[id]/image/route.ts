import sharp from "sharp";
import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { isPinterestImageUrl } from "@/lib/pinterest/image-url";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

/** Ảnh pin cùng origin để trình duyệt có thể copy vào clipboard rồi dán thẳng vào Zalo. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const pin = await db.pinterestPin.findUnique({ where: { id }, select: { sourceImageUrl: true } });
  if (!pin) return jsonError(404, "Pin Pinterest không tồn tại.");
  if (!isPinterestImageUrl(pin.sourceImageUrl)) return jsonError(502, "Địa chỉ ảnh Pinterest không hợp lệ.");

  let upstream: Response;
  try {
    upstream = await fetch(pin.sourceImageUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    return jsonError(502, "Không tải được ảnh từ Pinterest.");
  }
  if (!upstream.ok) return jsonError(502, `Pinterest trả lỗi khi tải ảnh (${upstream.status}).`);
  const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SOURCE_BYTES) return jsonError(413, "Ảnh Pinterest quá lớn.");

  const source = Buffer.from(await upstream.arrayBuffer());
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) return jsonError(413, "Ảnh Pinterest rỗng hoặc quá lớn.");
  let jpeg: Buffer;
  try {
    jpeg = await sharp(source, { limitInputPixels: 80_000_000 }).rotate().jpeg({ quality: 92 }).toBuffer();
  } catch {
    return jsonError(502, "Dữ liệu Pinterest trả về không phải ảnh hợp lệ.");
  }

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `inline; filename="pinterest-${id}.jpg"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
