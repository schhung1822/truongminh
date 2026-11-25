import "server-only";
import { db } from "@/lib/db";

/**
 * Tập id các chất liệu đã dùng trong báo giá (bảng quotes, khóa ngoại RESTRICT). Chỉ nhóm này mới bị chặn xóa cứng
 * (xem lib/materials/delete.ts, D106): báo giá là hồ sơ tài chính, phải giữ đúng chất liệu đã tính giá.
 */
export async function getQuotedMaterialIds(): Promise<Set<string>> {
  const rows = await db.quote.findMany({ distinct: ["materialId"], select: { materialId: true } });
  return new Set(rows.map((r) => r.materialId));
}

/**
 * Tập id các chất liệu ĐÃ TỪNG DÙNG để tạo ảnh hoặc báo giá. Chỉ để hiển thị thông tin "Đã dùng" trên trang Chất
 * liệu (app/(app)/admin/materials/page.tsx) — từ D106, nhóm này KHÔNG còn chặn xóa cứng, trừ phần đã có báo giá
 * (xem getQuotedMaterialIds): chất liệu chỉ dùng để tạo ảnh (catalog hoặc thiết kế) vẫn xóa được, ảnh cũ vẫn giữ
 * nguyên qua layoutSnapshot và khóa ngoại materialId tự chuyển NULL, chỉ không còn chọn lại được để tạo thiết kế
 * mới (xem app/(app)/sessions/[id]/design/page.tsx, lọc theo chất liệu còn tồn tại).
 * Ảnh catalog ghi chất liệu trong bản chụp bố cục (cột JSON layoutSnapshot) chứ không có khóa ngoại, nên phải đọc
 * cả JSON; ảnh thiết kế và chất liệu khách đã chọn thì có khóa ngoại.
 */
export async function getUsedMaterialIds(): Promise<Set<string>> {
  const [fromSnapshots, fromImages, fromSelections, fromQuotes] = await Promise.all([
    db.$queryRaw<{ mid: string | null }[]>`
      SELECT DISTINCT jt.mid
      FROM generated_images gi,
           JSON_TABLE(gi.layoutSnapshot, '$.cells[*]' COLUMNS (mid VARCHAR(191) PATH '$.materialId')) AS jt`,
    db.generatedImage.findMany({ where: { materialId: { not: null } }, distinct: ["materialId"], select: { materialId: true } }),
    db.sessionSelectedMaterial.findMany({ distinct: ["materialId"], select: { materialId: true } }),
    db.quote.findMany({ distinct: ["materialId"], select: { materialId: true } }),
  ]);

  const used = new Set<string>();
  for (const r of fromSnapshots) if (r.mid) used.add(r.mid);
  for (const r of fromImages) if (r.materialId) used.add(r.materialId);
  for (const r of fromSelections) used.add(r.materialId);
  for (const r of fromQuotes) used.add(r.materialId);
  return used;
}
