"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { createCatalogSession, retryImage } from "@/lib/jobs/create";
import { createDesignSession } from "@/lib/jobs/design";
import { kickSession } from "@/lib/jobs/process";
import { refinishSession } from "@/lib/jobs/refinish";
import { db } from "@/lib/db";
import { canEditOwned } from "@/lib/permissions";
import { groupSendEnabled } from "@/lib/zalo/settings";
import { deliverImage, sendSessionImages } from "@/lib/zalo/send";

export async function createCatalogSessionAction(
  logoId: string,
  sheetIds: string[],
): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const r = await createCatalogSession(user, { logoId, sheetIds });
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => kickSession(id)); // gửi sang nhà cung cấp SAU khi đã trả lời trình duyệt
  }
  return r;
}

/** Bước 2: tạo các ảnh thiết kế cho những chất liệu khách đã chọn. */
export async function createDesignSessionAction(input: {
  parentSessionId: string;
  materialIds: string[];
  productType: string;
  variants: number;
  note: string;
}): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const r = await createDesignSession(user, input);
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => kickSession(id));
  }
  return r;
}

/** Vẽ lại khung, nhãn và chân trang của các ảnh đã xong theo giao diện/cấu hình mới. Không gọi AI, không tốn token. */
export async function refinishSessionAction(sessionId: string): Promise<{ error?: string; count?: number }> {
  const user = await requireUser();
  const session = await db.consultSession.findUnique({ where: { id: sessionId }, select: { createdById: true } });
  if (!session) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ vẽ lại được ảnh của phiên do mình tạo." };
  const count = await refinishSession(sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  return { count };
}

export async function retryImageAction(imageId: string): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const r = await retryImage(user, imageId);
  if (r.error) return { error: r.error };
  const id = r.sessionId!;
  after(() => kickSession(id));
  revalidatePath(`/sessions/${id}`);
  return { ok: true };
}

/**
 * Gửi ảnh của phiên vào một nhóm Zalo. Có imageId = gửi đúng ảnh đó (nhanh, trả kết quả ngay);
 * không có = gửi mọi ảnh đã xong của phiên, chạy nền vì có thể mất cả phút (xem kết quả ở Quản trị > Zalo).
 * Ảnh đã gửi vào nhóm này rồi thì bỏ qua, không gửi trùng.
 */
export async function sendToZaloAction(input: {
  sessionId: string;
  groupId: string;
  imageId?: string;
}): Promise<{ error?: string; ok?: string }> {
  const user = await requireUser();
  const session = await db.consultSession.findUnique({
    where: { id: input.sessionId },
    select: { createdById: true, images: { where: { status: "SUCCESS", retries: { none: {} } }, select: { id: true } } },
  });
  if (!session) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ gửi được ảnh của phiên do mình tạo." };
  if (!(await groupSendEnabled())) return { error: "Chức năng gửi ảnh vào nhóm Zalo đang tắt hoặc chưa cấu hình. Báo quản trị viên." };

  const group = await db.zaloGroup.findUnique({ where: { id: input.groupId }, select: { id: true, chatId: true, name: true, isActive: true } });
  if (!group || !group.isActive) return { error: "Nhóm Zalo không tồn tại hoặc đang tắt." };

  if (input.imageId) {
    if (!session.images.some((i) => i.id === input.imageId)) return { error: "Ảnh này chưa tạo xong hoặc không thuộc phiên." };
    const r = await deliverImage(input.imageId, group);
    if (r.outcome === "failed") return { error: `Gửi Zalo lỗi: ${r.error}` };
    return { ok: r.outcome === "skipped" ? `Ảnh này đã gửi vào nhóm "${group.name}" trước đó.` : `Đã gửi ảnh vào nhóm "${group.name}".` };
  }

  if (session.images.length === 0) return { error: "Phiên chưa có ảnh nào tạo xong để gửi." };
  const { sessionId, groupId } = input;
  after(async () => {
    const s = await sendSessionImages(sessionId, groupId);
    if (s.failed > 0) console.error(`Zalo: gửi phiên ${sessionId} vào nhóm ${groupId}: ${s.sent} ảnh được, ${s.failed} lỗi (${s.error})`);
  });
  return { ok: `Đang gửi ${session.images.length} ảnh vào nhóm "${group.name}". Ảnh đã gửi trước đó sẽ được bỏ qua.` };
}
