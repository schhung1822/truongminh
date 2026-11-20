import "server-only";
import { db } from "@/lib/db";

/**
 * Tập id các chất liệu ĐÃ TỪNG DÙNG để tạo ảnh hoặc báo giá. Những chất liệu này không được xóa cứng
 * (chỉ tắt), để lịch sử luôn đầy đủ.
 * Ảnh catalog ghi chất liệu trong bản chụp bố cục (cột JSON layoutSnapshot) chứ không có khóa ngoại,
 * nên phải đọc cả JSON; ảnh thiết kế và chất liệu khách đã chọn thì có khóa ngoại.
 */
export async function getUsedMaterialIds(): Promise<Set<string>> {
  const [fromSnapshots, fromImages, fromSelections, fromQuotes] = await Promise.all([
    db.$queryRaw<{ mid: string | null }[]>`
      SELECT DISTINCT jt.mid
      FROM generated_images gi,
           JSON_TABLE(gi.layoutSnapshot, '$.cells[*]' COLUMNS (mid VARCHAR(191) PATH '$.materialId')) AS jt`,
    db.generatedImage.findMany({ where: { materialId: { not: null } }, distinct: ["materialId"], select: { materialId: true } }),
    db.sessionSelectedMaterial.findMany({ distinct: ["materialId"], select: { materialId: true } }),
    // báo giá cũng giữ chất liệu lại (khóa ngoại), nên chất liệu đã có báo giá chỉ được tắt chứ không xóa
    db.quote.findMany({ distinct: ["materialId"], select: { materialId: true } }),
  ]);

  const used = new Set<string>();
  for (const r of fromSnapshots) if (r.mid) used.add(r.mid);
  for (const r of fromImages) if (r.materialId) used.add(r.materialId);
  for (const r of fromSelections) used.add(r.materialId);
  for (const r of fromQuotes) used.add(r.materialId);
  return used;
}
