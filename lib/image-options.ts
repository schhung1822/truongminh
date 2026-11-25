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
