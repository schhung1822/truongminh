"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { createCatalogSession, retryImage } from "@/lib/jobs/create";
import { createDesignSession } from "@/lib/jobs/design";
import { kickSession } from "@/lib/jobs/process";
import { isLabelPos, isLabelStyle, type LabelPos, type LabelStyle } from "@/lib/imaging/label-pos";
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

/**
 * Đổi kiểu và vị trí nhãn chất liệu của một ảnh (hoặc mọi ảnh của phiên) rồi vẽ lại ảnh. Không gọi AI nên không tốn token.
 * Vị trí được lưu cùng ảnh, nên lần vẽ lại và tạo lại sau này vẫn giữ.
 */
export async function setLabelPositionAction(input: {
  sessionId: string;
  imageId?: string;
  labelPos?: string;
  labelStyle?: string;
}): Promise<{ error?: string; count?: number }> {
  const user = await requireUser();
  if (input.labelPos !== undefined && !isLabelPos(input.labelPos)) return { error: "Vị trí nhãn không hợp lệ." };
  if (input.labelStyle !== undefined && !isLabelStyle(input.labelStyle)) return { error: "Kiểu nhãn không hợp lệ." };
  if (!input.labelPos && !input.labelStyle) return { error: "Chưa chọn kiểu hoặc vị trí nhãn." };
  const session = await db.consultSession.findUnique({
    where: { id: input.sessionId },
    select: { createdById: true, images: { where: { retries: { none: {} } }, select: { id: true } } },
  });
  if (!session) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ chỉnh được nhãn của phiên do mình tạo." };
  if (input.imageId && !session.images.some((i) => i.id === input.imageId)) return { error: "Ảnh không thuộc phiên này." };
  const count = await refinishSession(input.sessionId, {
    imageId: input.imageId,
    labelPos: input.labelPos as LabelPos | undefined,
    labelStyle: input.labelStyle as LabelStyle | undefined,
  });
  revalidatePath(`/sessions/${input.sessionId}`);
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
