"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { validateTemplate } from "@/lib/prompts/render";

export type PromptResult = { error?: string; ok?: string };

/** Mỗi lần lưu là MỘT PHIÊN BẢN MỚI và trở thành bản đang dùng; các bản cũ vẫn giữ lại. */
export async function savePromptAction(kind: "CATALOG" | "DESIGN", body: string, note: string): Promise<PromptResult> {
  const admin = await requireAdmin();
  const text = body.replace(/\r\n/g, "\n").trim();
  const problem = validateTemplate(kind, text);
  if (problem) return { error: problem };

  const current = await db.promptTemplate.findFirst({ where: { kind, isActive: true } });
  if (current && current.body.trim() === text) return { error: "Nội dung không thay đổi so với bản đang dùng." };

  const version = await db.$transaction(async (tx) => {
    const max = await tx.promptTemplate.aggregate({ where: { kind }, _max: { version: true } });
    const v = (max._max.version ?? 0) + 1;
    await tx.promptTemplate.updateMany({ where: { kind }, data: { isActive: false } });
    await tx.promptTemplate.create({
      data: { kind, version: v, body: text, isActive: true, note: note.trim().slice(0, 200) || null, createdById: admin.id },
    });
    return v;
  });
  revalidatePath("/admin/prompts");
  return { ok: `Đã lưu thành phiên bản ${version} và bắt đầu dùng ngay.` };
}

/** Quay lại dùng một phiên bản cũ. */
export async function activatePromptAction(id: string): Promise<PromptResult> {
  await requireAdmin();
  const t = await db.promptTemplate.findUnique({ where: { id } });
  if (!t) return { error: "Không tìm thấy phiên bản." };
  await db.$transaction([
    db.promptTemplate.updateMany({ where: { kind: t.kind }, data: { isActive: false } }),
    db.promptTemplate.update({ where: { id }, data: { isActive: true } }),
  ]);
  revalidatePath("/admin/prompts");
  return { ok: `Đang dùng phiên bản ${t.version}.` };
}
