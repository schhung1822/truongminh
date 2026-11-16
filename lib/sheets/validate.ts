import { MAX_MATERIALS_PER_SHEET, MAX_REFERENCE_IMAGES } from "@/lib/image-options";

/**
 * Kiểm tra cấu hình một trang mẫu. Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
 * - tối đa 10 chất liệu (API giới hạn 16 ảnh tham chiếu: 1 logo + mỗi chất liệu 1 ảnh)
 * - số chất liệu không vượt số ô (cột x hàng)
 */
export function validateSheetComposition(input: {
  cols: number;
  rows: number;
  materialCount: number;
}): string | null {
  const { cols, rows, materialCount } = input;
  if (!Number.isInteger(cols) || cols < 1 || cols > 5) return "Số cột phải từ 1 đến 5.";
  if (!Number.isInteger(rows) || rows < 1 || rows > 10) return "Số hàng phải từ 1 đến 10.";
  if (materialCount > MAX_MATERIALS_PER_SHEET) {
    return `Một trang mẫu tối đa ${MAX_MATERIALS_PER_SHEET} chất liệu.`;
  }
  if (1 + materialCount > MAX_REFERENCE_IMAGES) {
    return `Vượt giới hạn ${MAX_REFERENCE_IMAGES} ảnh tham chiếu mỗi lượt.`;
  }
  if (materialCount > cols * rows) {
    return `Trang ${cols} cột x ${rows} hàng chỉ có ${cols * rows} ô, không đủ chỗ cho ${materialCount} chất liệu.`;
  }
  return null;
}
