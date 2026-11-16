"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { createCatalogSession, retryImage } from "@/lib/jobs/create";
import { kickSession } from "@/lib/jobs/process";
import { refinishSession } from "@/lib/jobs/refinish";
import { db } from "@/lib/db";
import { canEditOwned } from "@/lib/permissions";

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
