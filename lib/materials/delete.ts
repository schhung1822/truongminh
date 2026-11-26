import "server-only";
import { REFERENCE_TAG_VERSION } from "@/lib/imaging/reference-tag";
import { refTagKeys } from "@/lib/storage/keys";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getQuotedMaterialIds } from "./usage";

export type DeleteMaterialsResult = {
  deleted: string[]; // mã đã xóa
  skipped: { code: string; reason: string }[];
};

/**
 * Xóa cứng chất liệu. Chỉ chất liệu đã dùng trong báo giá mới bị giữ lại (D44: hồ sơ tài chính, phải giữ đúng chất
 * liệu đã tính giá) — chất liệu chỉ dùng để tạo ảnh (catalog hoặc thiết kế) vẫn xóa được (D106): ảnh cũ giữ nguyên
 * nhờ bản chụp bố cục (layoutSnapshot) và khóa ngoại materialId của ảnh tự chuyển NULL khi xóa, chỉ không còn
 * chọn lại được chất liệu này để tạo thiết kế mới. Chất liệu đang nằm trong trang mẫu, hoặc từng được chọn cho một
 * lượt thiết kế, được gỡ khỏi đó rồi mới xóa.
 */
export async function deleteMaterials(ids: string[]): Promise<DeleteMaterialsResult> {
  const unique = [...new Set(ids)].slice(0, 500);
  const result: DeleteMaterialsResult = { deleted: [], skipped: [] };
  if (unique.length === 0) return result;

  const [materials, quoted] = await Promise.all([db.material.findMany({ where: { id: { in: unique } } }), getQuotedMaterialIds()]);
  const storage = getStorage();

  for (const m of materials) {
    if (quoted.has(m.id)) {
      result.skipped.push({ code: m.code, reason: "đã dùng trong báo giá, hãy tắt thay vì xóa" });
      continue;
    }
    try {
      await db.$transaction([
        db.sheetMaterial.deleteMany({ where: { materialId: m.id } }),
        db.sessionSelectedMaterial.deleteMany({ where: { materialId: m.id } }),
        db.material.delete({ where: { id: m.id } }),
      ]);
    } catch (e) {
      console.error(`Xóa chất liệu ${m.code} lỗi:`, e);
      result.skipped.push({ code: m.code, reason: "không xóa được, vui lòng thử lại" });
      continue;
    }
    result.deleted.push(m.code);
    // dọn file ảnh mẫu của chất liệu (lỗi dọn file không làm hỏng kết quả xóa); không đụng tới ảnh đã tạo (finalPath/originalPath của GeneratedImage)
    const files = [m.layer1Path, m.layer2Path, m.productPhotoPath, m.referencePath, ...(m.referencePath ? refTagKeys(m.referencePath, REFERENCE_TAG_VERSION) : [])].filter(
      (k): k is string => !!k,
    );
    await Promise.all(files.map((k) => storage.delete(k).catch(() => {})));
  }
  const found = new Set(materials.map((m) => m.id));
  for (const id of unique) if (!found.has(id)) result.skipped.push({ code: id, reason: "không còn tồn tại" });
  return result;
}
