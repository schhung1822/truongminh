"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { ASPECT_RATIOS, RESOLUTIONS } from "@/lib/image-options";
import { validateSheetComposition } from "@/lib/sheets/validate";

export type SheetSaveResult = { error?: string; id?: string };

const sheetSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên trang mẫu.").max(100),
  groupName: z.string().trim().max(100),
  cols: z.number().int(),
  rows: z.number().int(),
  aspectRatio: z.enum(ASPECT_RATIOS),
  resolution: z.enum(RESOLUTIONS),
  isActive: z.boolean(),
  materialIds: z.array(z.string()).max(50),
});

export type SheetInput = z.input<typeof sheetSchema>;

/** Lưu trang mẫu (tạo mới nếu id = null) cùng danh sách chất liệu theo thứ tự. */
export async function saveSheetAction(id: string | null, input: SheetInput): Promise<SheetSaveResult> {
  await requireAdmin();
  const parsed = sheetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { materialIds, ...fields } = parsed.data;

  if (new Set(materialIds).size !== materialIds.length) return { error: "Một chất liệu bị chọn hai lần." };
  const problem = validateSheetComposition({ cols: fields.cols, rows: fields.rows, materialCount: materialIds.length });
  if (problem) return { error: problem };

  const found = await db.material.count({ where: { id: { in: materialIds } } });
  if (found !== materialIds.length) return { error: "Có chất liệu không còn tồn tại. Hãy tải lại trang." };

  if (id && !(await db.sheet.findUnique({ where: { id }, select: { id: true } }))) {
    return { error: "Không tìm thấy trang mẫu." };
  }

  const sheetId = await db.$transaction(async (tx) => {
    const sheet = id
      ? await tx.sheet.update({ where: { id }, data: fields })
      : await tx.sheet.create({
          data: {
            ...fields,
            sortOrder: ((await tx.sheet.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1,
          },
        });
    await tx.sheetMaterial.deleteMany({ where: { sheetId: sheet.id } });
    if (materialIds.length > 0) {
      await tx.sheetMaterial.createMany({
        data: materialIds.map((materialId, position) => ({ sheetId: sheet.id, materialId, position })),
      });
    }
    return sheet.id;
  });

  revalidatePath("/admin/sheets");
  return { id: sheetId };
}

export async function setSheetActiveAction(id: string, isActive: boolean): Promise<{ error?: string; ok?: string }> {
  await requireAdmin();
  if (!(await db.sheet.findUnique({ where: { id }, select: { id: true } }))) return { error: "Không tìm thấy trang mẫu." };
  await db.sheet.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin/sheets");
  return { ok: isActive ? "Đã bật trang mẫu." : "Đã tắt trang mẫu." };
}
