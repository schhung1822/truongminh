"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type PinterestActionResult = { error?: string; ok?: string };

/**
 * Thay toàn bộ tag phong cách của một pin (dùng chung danh mục STYLE_TAG với Chất liệu).
 * Xoá-rồi-tạo-lại trong một transaction, giống replaceStyleTags ở lib/materials/save.ts.
 */
export async function replacePinStyleTagsAction(pinId: string, values: string[]): Promise<PinterestActionResult> {
  await requireAdmin();
  const pin = await db.pinterestPin.findUnique({ where: { id: pinId }, select: { id: true } });
  if (!pin) return { error: "Không tìm thấy pin." };

  const clean = [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, 20);
  const valid = clean.length
    ? await db.materialOption.findMany({ where: { type: "STYLE_TAG", value: { in: clean } }, select: { value: true } })
    : [];

  await db.$transaction([
    db.pinterestPinStyleTag.deleteMany({ where: { pinId } }),
    ...(valid.length ? [db.pinterestPinStyleTag.createMany({ data: valid.map((v) => ({ pinId, value: v.value })) })] : []),
  ]);
  revalidatePath("/pinterest");
  return { ok: "Đã cập nhật tag phong cách." };
}
