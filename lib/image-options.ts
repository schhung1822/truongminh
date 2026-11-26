// Các lựa chọn dùng chung cho trang mẫu và gọi AI. Kiểm tra lại với docs.kie.ai ở GĐ5.
export const ASPECT_RATIOS = ["2:3", "3:2", "1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export const RESOLUTIONS = ["1K", "2K", "4K"] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

/** Cạnh dài (px) tương ứng từng độ phân giải, dùng cho ảnh giả và tính kích thước. */
export const RESOLUTION_LONG_EDGE: Record<Resolution, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
};

/** "2:3" -> { w: 2, h: 3 } */
export function parseAspect(ratio: string): { w: number; h: number } {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) throw new Error(`Tỉ lệ ảnh không hợp lệ: ${ratio}`);
  return { w, h };
}

export function aspectSize(ratio: string, resolution: Resolution): { width: number; height: number } {
  const { w, h } = parseAspect(ratio);
  const edge = RESOLUTION_LONG_EDGE[resolution];
  return w >= h
    ? { width: edge, height: Math.round((edge * h) / w) }
    : { width: Math.round((edge * w) / h), height: edge };
}

// Giới hạn cứng
export const MAX_MATERIALS_PER_IMAGE = 10; // một ảnh: API tối đa 16 ảnh tham chiếu = 1 logo + chất liệu
export const MAX_MATERIALS_IN_SHEET = 200; // một trang mẫu có thể dài hơn một ảnh: tự chia thành nhiều ảnh khi tạo
export const MAX_REFERENCE_IMAGES = 16;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// Số ảnh phong cách Pinterest tối đa chọn được mỗi lượt thiết kế (docs/DECISIONS.md D99).
export const MAX_STYLE_REF_PINS = 3;

// AI chọn chất liệu hợp với logo rồi tự tạo ảnh mẫu (docs/DECISIONS.md D115).
/** Các mức "số chất liệu AI chọn cho mỗi logo" cho chỉnh ở Quản trị > Cấu hình. */
export const AUTO_MATERIAL_COUNTS = [16, 24, 32, 48] as const;
/** Bố cục ảnh của phiên AI chọn: 8 chất liệu mỗi ảnh, giống các trang mẫu đang dùng. */
export const AUTO_SHEET_LAYOUT = { cols: 2, rows: 4, aspectRatio: "16:9" } as const;
export const AUTO_SHEET_NAME = "Chất liệu phù hợp";
/** Tên "trang mẫu" của phiên tạo ảnh với tất cả chất liệu đang bật (D126), hiện ở tiêu đề ảnh. */
export const ALL_MATERIALS_SHEET_NAME = "Tất cả chất liệu";

/**
 * Bố cục 8 ô của phiên AI chọn, theo HÌNH DẠNG logo (D120). Ảnh AI là 16:9: chia 2 cột x 4 hàng thì mỗi ô là một dải dẹt
 * (rộng gấp ~3,6 lần cao), hợp logo chữ ngang; nhưng logo gần vuông đặt vào đó chỉ cao bằng 1/4 ảnh, hai bên bỏ trống.
 * Chia 4 cột x 2 hàng thì ô gần vuông, logo gần vuông to gấp rưỡi tới gấp đôi mà không tốn thêm gì.
 * Ngưỡng 1,8 là điểm hai cách chia cho logo to bằng nhau.
 */
export const AUTO_WIDE_LOGO_RATIO = 1.8;
export function autoSheetLayout(logoWidth: number, logoHeight: number): { cols: number; rows: number; aspectRatio: string } {
  const tallCells = logoWidth > 0 && logoHeight > 0 && logoWidth / logoHeight < AUTO_WIDE_LOGO_RATIO;
  return tallCells ? { cols: 4, rows: 2, aspectRatio: "16:9" } : AUTO_SHEET_LAYOUT;
}

/**
 * Chế độ chất lượng cao (D120): AI chỉ vẽ ngần này chất liệu mỗi lần (một "mảnh" 2 x 2), các mảnh được ghép lại thành
 * một ảnh. Mỗi mảnh là một tác vụ AI và tính một lượt. Xem lib/jobs/tiles.ts.
 */
export const QUALITY_TILE_CELLS = 4;
