import "server-only";
import { db } from "@/lib/db";
import type { MaterialOption } from "./material-picker";

/**
 * Chất liệu ĐANG BẬT để sale chọn. Chỉ lấy các cột để nhận diện chất liệu (mã, tên, nhóm, công nghệ, độ dày):
 * KHÔNG đọc giá tấm hay thông số tấm ở đây, việc đó chỉ diễn ra trong lib/quoting/store.ts.
 */
export async function loadActiveMaterials(): Promise<MaterialOption[]> {
  const rows = await db.material.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, groupName: true, printTech: true, thicknessMm: true },
  });
  return rows;
}
