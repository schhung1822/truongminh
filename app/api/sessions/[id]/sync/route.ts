import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { syncSession } from "@/lib/jobs/process";
import { loadSessionViews } from "@/lib/jobs/views";

// Màn hình kết quả gọi mỗi vài giây: đẩy các ảnh chưa xong đi tiếp rồi trả trạng thái mới nhất.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const session = await db.consultSession.findUnique({ where: { id }, select: { id: true } });
  if (!session) return jsonError(404, "Không tìm thấy phiên.");

  try {
    await syncSession(id);
  } catch (e) {
    console.error("sync lỗi:", e);
  }
  return Response.json({ images: await loadSessionViews(id, user) });
}
