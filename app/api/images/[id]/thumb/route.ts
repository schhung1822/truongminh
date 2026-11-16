import sharp from "sharp";
import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

const THUMB_WIDTH = 480;

/** Ảnh thu nhỏ của ảnh hoàn thiện (để trang Lịch sử tải nhanh). Tạo lần đầu rồi lưu lại trong kho. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const img = await db.generatedImage.findUnique({ where: { id }, select: { status: true, finalPath: true } });
  if (!img || img.status !== "SUCCESS" || !img.finalPath) return jsonError(404, "Ảnh chưa sẵn sàng.");

  const storage = getStorage();
  const thumbKey = img.finalPath.replace(/\.jpg$/, "-thumb.jpg"); // khóa đổi khi ảnh được vẽ lại, nên thu nhỏ luôn khớp
  let data: Buffer;
  if (await storage.exists(thumbKey)) {
    data = await storage.get(thumbKey);
  } else {
    const full = await storage.get(img.finalPath);
    data = await sharp(full).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    await storage.put(thumbKey, data);
  }
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
