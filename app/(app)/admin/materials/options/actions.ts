"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { OPTION_TYPES, slugifyValue, type OptionType } from "@/lib/materials/option-types";
import { countOptionUsage } from "@/lib/materials/option-usage";

export type OptionResult = { error?: string; ok?: string };

const LABEL_MAX = 100;

function refresh() {
  // danh mục ảnh hưởng form, danh sách, bộ lọc chất liệu
  revalidatePath("/admin/materials", "layout");
}

const isType = (t: string): t is OptionType => (OPTION_TYPES as readonly string[]).includes(t);

/** Thêm giá trị mới. "value" (mã không dấu) tự sinh từ nhãn nếu không nhập, và không đổi được sau khi tạo. */
export async function createOptionAction(type: string, label: string, value?: string): Promise<OptionResult> {
  await requireAdmin();
  if (!isType(type)) return { error: "Loại danh mục không hợp lệ." };
  const l = label.trim();
  if (!l) return { error: "Vui lòng nhập nhãn." };
  if (l.length > LABEL_MAX) return { error: `Nhãn tối đa ${LABEL_MAX} ký tự.` };
  const v = slugifyValue((value ?? "").trim() || l);
  if (!v) return { error: "Không tạo được mã từ nhãn này, hãy nhập mã không dấu (a-z, 0-9, gạch nối)." };

  const same = await db.materialOption.findMany({ where: { type }, select: { value: true, label: true, sortOrder: true } });
  if (same.some((o) => o.value === v)) return { error: `Mã "${v}" đã có trong danh mục này.` };
  if (same.some((o) => o.label.toLowerCase() === l.toLowerCase())) return { error: `Nhãn "${l}" đã có trong danh mục này.` };
  const sortOrder = (same.reduce((m, o) => Math.max(m, o.sortOrder), 0) || 0) + 10;
  await db.materialOption.create({ data: { type, value: v, label: l, sortOrder } });
  refresh();
  return { ok: `Đã thêm "${l}".` };
}

/** Sửa nhãn, thứ tự, bật/tắt. Nhóm chất liệu và công nghệ in đổi nhãn thì hai cột cũ (groupName, printTech) đổi theo. */
export async function updateOptionAction(id: string, patch: { label: string; sortOrder: number; isActive: boolean }): Promise<OptionResult> {
  await requireAdmin();
  const opt = await db.materialOption.findUnique({ where: { id } });
  if (!opt) return { error: "Không tìm thấy giá trị." };
  const label = patch.label.trim();
  if (!label) return { error: "Vui lòng nhập nhãn." };
  if (label.length > LABEL_MAX) return { error: `Nhãn tối đa ${LABEL_MAX} ký tự.` };
  if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0 || patch.sortOrder > 100000) return { error: "Thứ tự phải là số nguyên từ 0 trở lên." };
  const clash = await db.materialOption.findFirst({ where: { type: opt.type, label, NOT: { id } } });
  if (clash) return { error: `Nhãn "${label}" đã có trong danh mục này.` };

  const ops = [db.materialOption.update({ where: { id }, data: { label, sortOrder: patch.sortOrder, isActive: patch.isActive } })];
  if (label !== opt.label) {
    if (opt.type === "BASE_MATERIAL") ops.push(db.material.updateMany({ where: { baseMaterial: opt.value }, data: { groupName: label } }) as never);
    if (opt.type === "TECHNIQUE") ops.push(db.material.updateMany({ where: { technique: opt.value }, data: { printTech: label } }) as never);
  }
  await db.$transaction(ops);
  refresh();
  return { ok: "Đã lưu." };
}

/** Xóa giá trị chưa được chất liệu nào dùng. Đang dùng thì chỉ tắt được. */
export async function deleteOptionAction(id: string): Promise<OptionResult> {
  await requireAdmin();
  const opt = await db.materialOption.findUnique({ where: { id } });
  if (!opt) return { error: "Không tìm thấy giá trị." };
  const usage = await countOptionUsage();
  const used = usage[opt.type]?.[opt.value] ?? 0;
  if (used > 0) return { error: `Đang có ${used} lượt dùng, không xóa được. Hãy tắt giá trị này.` };
  await db.materialOption.delete({ where: { id } });
  refresh();
  return { ok: `Đã xóa "${opt.label}".` };
}
