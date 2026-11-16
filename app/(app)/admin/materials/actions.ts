"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { parseMaterialsCsv } from "@/lib/csv/materials";
import { deleteMaterials } from "@/lib/materials/delete";

export type ActionResult = { error?: string; ok?: string };

export async function setMaterialActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  const m = await db.material.findUnique({ where: { id }, select: { id: true } });
  if (!m) return { error: "Không tìm thấy chất liệu." };
  await db.material.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin/materials");
  revalidatePath("/admin/sheets");
  return { ok: isActive ? "Đã bật chất liệu." : "Đã tắt chất liệu." };
}

export type DeleteState = { error?: string; deleted?: number; skipped?: { code: string; reason: string }[] };

/** Xóa một hoặc nhiều chất liệu chưa từng dùng. Chất liệu đã dùng bị giữ lại và được báo rõ. */
export async function deleteMaterialsAction(ids: string[]): Promise<DeleteState> {
  await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Chưa chọn chất liệu nào." };
  const r = await deleteMaterials(ids);
  revalidatePath("/admin/materials");
  revalidatePath("/admin/sheets");
  return { deleted: r.deleted.length, skipped: r.skipped };
}

export type ImportState = {
  error?: string;
  created?: number;
  skipped?: string[];
  errors?: { line: number; message: string }[];
};

const MAX_CSV_BYTES = 2 * 1024 * 1024;

export async function importMaterialsCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Vui lòng chọn file CSV." };
  if (file.size > MAX_CSV_BYTES) return { error: "File CSV quá lớn (tối đa 2MB)." };

  const { rows, errors } = parseMaterialsCsv(await file.text());
  if (rows.length === 0) {
    return { error: errors[0]?.message ?? "Không có dòng hợp lệ nào để nhập.", errors };
  }

  const existing = await db.material.findMany({
    where: { code: { in: rows.map((r) => r.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((e) => e.code.toLowerCase()));
  const fresh = rows.filter((r) => !existingCodes.has(r.code.toLowerCase()));
  const skipped = rows.filter((r) => existingCodes.has(r.code.toLowerCase())).map((r) => r.code);

  const max = await db.material.aggregate({ _max: { sortOrder: true } });
  let order = (max._max.sortOrder ?? 0) + 1;

  if (fresh.length > 0) {
    await db.material.createMany({
      data: fresh.map((r) => ({
        code: r.code,
        name: r.name,
        groupName: r.groupName || "Chưa phân nhóm",
        printTech: r.printTech || "Chưa rõ",
        descHuman: r.descHuman,
        descAi: "",
        isActive: true,
        sortOrder: order++,
      })),
    });
  }
  revalidatePath("/admin/materials");
  return { created: fresh.length, skipped, errors };
}
