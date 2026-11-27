import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { fetchPinJpeg, PinImageError } from "@/lib/pinterest/pin-image";

/** Ảnh pin cùng origin để trình duyệt có thể copy vào clipboard rồi dán thẳng vào Zalo. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const pin = await db.pinterestPin.findUnique({ where: { id }, select: { sourceImageUrl: true } });
  if (!pin) return jsonError(404, "Pin Pinterest không tồn tại.");

  let jpeg: Buffer;
  try {
    jpeg = await fetchPinJpeg(pin.sourceImageUrl);
  } catch (e) {
    if (e instanceof PinImageError) return jsonError(e.status, e.message);
    throw e;
  }

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `inline; filename="pinterest-${id}.jpg"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
