"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { deleteMaterials } from "@/lib/materials/delete";
import { runMaterialsImport, type ImportReport } from "@/lib/materials/import";
import type { ImportMode } from "@/lib/materials/import-plan";

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
  /** báo cáo của lần chạy gần nhất (chạy thử hoặc nhập thật) */
  report?: ImportReport;
};

const MAX_CSV_BYTES = 2 * 1024 * 1024;

/**
 * Nhập CSV chất liệu. mode: "create-only" (bỏ qua mã đã có, như trước) hoặc "upsert" (cập nhật theo id rồi theo mã, chưa có thì thêm mới).
 * Có đánh dấu "chỉ kiểm tra" thì không ghi gì, chỉ báo trước sẽ làm gì.
 */
export async function importMaterialsCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Vui lòng chọn file CSV." };
  if (file.size > MAX_CSV_BYTES) return { error: "File CSV quá lớn (tối đa 2MB)." };
  const mode: ImportMode = formData.get("mode") === "create-only" ? "create-only" : "upsert";
  const dryRun = formData.get("dryRun") === "on";

  let result;
  try {
    result = await runMaterialsImport(await file.text(), mode, dryRun);
  } catch (e) {
    console.error("importMaterialsCsvAction lỗi:", e);
    return { error: "Không nhập được, chưa có thay đổi nào được ghi. Vui lòng kiểm tra file và thử lại." };
  }
  if ("error" in result) return { error: result.error };
  if (!dryRun) {
    revalidatePath("/admin/materials");
    revalidatePath("/admin/sheets");
  }
  return { report: result };
}
