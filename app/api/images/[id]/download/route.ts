import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";

/** Tên file tải về: có dấu tiếng Việt (filename*) và bản không dấu dự phòng cho trình duyệt cũ. */
function contentDisposition(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// Tải ảnh hoàn thiện về máy.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const img = await db.generatedImage.findUnique({
    where: { id },
    include: { session: { include: { logo: { include: { brand: true } } } } },
  });
  if (!img || img.status !== "SUCCESS" || !img.finalPath) return jsonError(404, "Ảnh chưa sẵn sàng hoặc không tồn tại.");

  const snapshot = img.layoutSnapshot as unknown as LayoutSnapshot;
  const name = `${img.session.logo.brand.name} - ${snapshot.title}.jpg`.replace(/[\\/:*?"<>|]+/g, " ");

  const data = await getStorage().get(img.finalPath);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": contentDisposition(name),
      "Cache-Control": "private, no-store",
    },
  });
}
