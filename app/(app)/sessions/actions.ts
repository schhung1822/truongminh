"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { createCatalogSession, retryImage } from "@/lib/jobs/create";
import { kickSession } from "@/lib/jobs/process";

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

export async function retryImageAction(imageId: string): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const r = await retryImage(user, imageId);
  if (r.error) return { error: r.error };
  const id = r.sessionId!;
  after(() => kickSession(id));
  revalidatePath(`/sessions/${id}`);
  return { ok: true };
}
