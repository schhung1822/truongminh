"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type StyleResult = { error?: string; ok?: string };

const styleSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên kiểu thiết kế.").max(100, "Tên tối đa 100 ký tự."),
  description: z.string().trim().min(1, "Vui lòng nhập mô tả cho AI.").max(1500, "Mô tả tối đa 1500 ký tự."),
  sortOrder: z.coerce.number().int("Thứ tự phải là số nguyên.").min(0).max(100000).optional(),
});

function refresh() {
  revalidatePath("/admin/design-styles");
}

export async function createStyleAction(input: { name: string; description: string }): Promise<StyleResult> {
  await requireAdmin();
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const max = await db.designStyle.aggregate({ _max: { sortOrder: true } });
  await db.designStyle.create({
    data: { name: parsed.data.name, description: parsed.data.description, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  refresh();
  return { ok: "Đã thêm kiểu thiết kế." };
}

export async function updateStyleAction(
  id: string,
  input: { name: string; description: string; sortOrder: number },
): Promise<StyleResult> {
  await requireAdmin();
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await db.designStyle.findUnique({ where: { id }, select: { id: true } }))) return { error: "Không tìm thấy kiểu thiết kế." };
  await db.designStyle.update({
    where: { id },
    data: { name: parsed.data.name, description: parsed.data.description, sortOrder: parsed.data.sortOrder ?? 0 },
  });
  refresh();
  return { ok: "Đã lưu kiểu thiết kế." };
}

export async function setStyleActiveAction(id: string, isActive: boolean): Promise<StyleResult> {
  await requireAdmin();
  if (!(await db.designStyle.findUnique({ where: { id }, select: { id: true } }))) return { error: "Không tìm thấy kiểu thiết kế." };
  await db.designStyle.update({ where: { id }, data: { isActive } });
  refresh();
  return { ok: isActive ? "Đã bật kiểu thiết kế." : "Đã tắt kiểu thiết kế." };
}

/** Chỉ xóa được kiểu CHƯA TỪNG dùng để tạo ảnh (kiểu đã dùng chỉ tắt, để lịch sử đầy đủ). */
export async function deleteStyleAction(id: string): Promise<StyleResult> {
  await requireAdmin();
  const style = await db.designStyle.findUnique({ where: { id }, include: { _count: { select: { generatedImages: true } } } });
  if (!style) return { error: "Không tìm thấy kiểu thiết kế." };
  if (style._count.generatedImages > 0) {
    return { error: `Kiểu "${style.name}" đã dùng cho ${style._count.generatedImages} ảnh nên không xóa được. Hãy bấm Tắt.` };
  }
  await db.designStyle.delete({ where: { id } });
  refresh();
  return { ok: "Đã xóa kiểu thiết kế." };
}
