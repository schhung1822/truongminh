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
export const MAX_MATERIALS_PER_SHEET = 10; // API tối đa 16 ảnh tham chiếu = 1 logo + chất liệu
export const MAX_REFERENCE_IMAGES = 16;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
