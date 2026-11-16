/** Bản chụp bố cục lưu cùng mỗi ảnh (cột "layoutSnapshot"), để sau này sửa trang mẫu không làm sai ảnh cũ. */
export type LayoutSnapshot = {
  cols: number;
  rows: number;
  /** tên trang mẫu (ảnh catalog) hoặc tên chất liệu (ảnh thiết kế) */
  title: string;
  /** các ô theo thứ tự đọc; ảnh thiết kế chỉ có một ô */
  cells: { materialId: string; code: string; name: string }[];
  design?: { productType: string; styleName: string; note: string };
};

export const MAX_SHEETS_PER_SESSION = 20;
export const MAX_ATTEMPTS = 2; // lần đầu + 1 lần tự thử lại
