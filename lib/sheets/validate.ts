import { MAX_MATERIALS_IN_SHEET, MAX_MATERIALS_PER_IMAGE, MAX_REFERENCE_IMAGES } from "@/lib/image-options";

/**
 * Kiểm tra cấu hình một trang mẫu. Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
 * - bố cục (cột x hàng) là bố cục của MỘT ảnh; mỗi ảnh chứa tối đa 10 chất liệu (API giới hạn 16 ảnh tham chiếu)
 * - trang có thể chứa nhiều chất liệu hơn số ô: khi tạo ảnh sẽ tự chia thành nhiều ảnh (xem split.ts)
 */
export function validateSheetComposition(input: {
  cols: number;
  rows: number;
  materialCount: number;
}): string | null {
  const { cols, rows, materialCount } = input;
  if (!Number.isInteger(cols) || cols < 1 || cols > 5) return "Số cột phải từ 1 đến 5.";
  if (!Number.isInteger(rows) || rows < 1 || rows > 10) return "Số hàng phải từ 1 đến 10.";
  if (materialCount > MAX_MATERIALS_IN_SHEET) {
    return `Một trang mẫu tối đa ${MAX_MATERIALS_IN_SHEET} chất liệu.`;
  }
  if (1 + Math.min(cols * rows, MAX_MATERIALS_PER_IMAGE) > MAX_REFERENCE_IMAGES) {
    return `Vượt giới hạn ${MAX_REFERENCE_IMAGES} ảnh tham chiếu mỗi lượt.`;
  }
  return null;
}
