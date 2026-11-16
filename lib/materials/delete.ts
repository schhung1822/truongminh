import "server-only";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getUsedMaterialIds } from "./usage";

export type DeleteMaterialsResult = {
  deleted: string[]; // mã đã xóa
  skipped: { code: string; reason: string }[];
};

/**
 * Xóa cứng các chất liệu CHƯA TỪNG DÙNG (kể cả ảnh trong kho). Chất liệu đã từng dùng để tạo ảnh bị giữ lại.
 * Chất liệu đang nằm trong trang mẫu thì được gỡ khỏi các trang đó rồi mới xóa.
 */
export async function deleteMaterials(ids: string[]): Promise<DeleteMaterialsResult> {
  const unique = [...new Set(ids)].slice(0, 500);
  const result: DeleteMaterialsResult = { deleted: [], skipped: [] };
  if (unique.length === 0) return result;

  const [materials, used] = await Promise.all([
    db.material.findMany({ where: { id: { in: unique } } }),
    getUsedMaterialIds(),
  ]);
  const storage = getStorage();

  for (const m of materials) {
    if (used.has(m.id)) {
      result.skipped.push({ code: m.code, reason: "đã từng dùng để tạo ảnh, hãy tắt thay vì xóa" });
      continue;
    }
    try {
      await db.$transaction([
        db.sheetMaterial.deleteMany({ where: { materialId: m.id } }),
        db.material.delete({ where: { id: m.id } }),
      ]);
    } catch (e) {
      console.error(`Xóa chất liệu ${m.code} lỗi:`, e);
      result.skipped.push({ code: m.code, reason: "không xóa được, vui lòng thử lại" });
      continue;
    }
    result.deleted.push(m.code);
    // dọn file ảnh (lỗi dọn file không làm hỏng kết quả xóa)
    const files = [m.layer1Path, m.layer2Path, m.productPhotoPath, m.referencePath].filter((k): k is string => !!k);
    await Promise.all(files.map((k) => storage.delete(k).catch(() => {})));
  }
  const found = new Set(materials.map((m) => m.id));
  for (const id of unique) if (!found.has(id)) result.skipped.push({ code: id, reason: "không còn tồn tại" });
  return result;
}
