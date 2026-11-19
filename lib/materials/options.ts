import "server-only";
import { db } from "@/lib/db";
import type { OptionRow, OptionType } from "./option-types";

/** Toàn bộ danh mục (cả giá trị đã tắt), sắp theo loại rồi thứ tự rồi nhãn. */
export async function loadOptions(): Promise<OptionRow[]> {
  const rows = await db.materialOption.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { label: "asc" }] });
  return rows.map((r) => ({ type: r.type as OptionType, value: r.value, label: r.label, sortOrder: r.sortOrder, isActive: r.isActive }));
}
