import { MAX_MATERIALS_PER_IMAGE } from "@/lib/image-options";

/**
 * Một trang mẫu có thể chứa nhiều chất liệu hơn số ô của một ảnh. Khi tạo ảnh, danh sách chất liệu
 * (theo thứ tự) được cắt thành từng đoạn bằng số ô của bố cục, mỗi đoạn là một ảnh.
 * Ví dụ trang 2 cột x 4 hàng có 80 chất liệu: 8 chất liệu mỗi ảnh nên ra 10 ảnh.
 */

/** Số chất liệu tối đa trong một ảnh: số ô của bố cục, nhưng không quá giới hạn ảnh tham chiếu của API. */
export function materialsPerImage(cols: number, rows: number): number {
  return Math.max(1, Math.min(cols * rows, MAX_MATERIALS_PER_IMAGE));
}

/** Cắt danh sách chất liệu thành các đoạn, mỗi đoạn một ảnh. Danh sách rỗng thì không có ảnh nào. */
export function splitIntoImages<T>(items: readonly T[], cols: number, rows: number): T[][] {
  const size = materialsPerImage(cols, rows);
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/** Số ảnh sẽ được tạo từ một trang mẫu có `usable` chất liệu dùng được. */
export function countSheetImages(usable: number, cols: number, rows: number): number {
  return usable <= 0 ? 0 : Math.ceil(usable / materialsPerImage(cols, rows));
}

/** Tên hiển thị của một ảnh: trang nhiều ảnh thì thêm "(2/10)" để phân biệt. */
export function partTitle(sheetName: string, index: number, total: number): string {
  return total > 1 ? `${sheetName} (${index}/${total})` : sheetName;
}
