import { computeCells } from "@/lib/grid/layout";
import { parseAspect } from "@/lib/image-options";

/**
 * Hình học của ảnh thành phẩm (đầu trang + ảnh AI + chân trang), dùng chung cho máy chủ (vẽ ảnh) và giao diện
 * (đặt vùng bấm lên từng ô). Phép tính thuần, không phụ thuộc thư viện ảnh.
 */

/** Chiều cao phần đầu trang so với chiều rộng ảnh. */
export const HEADER_RATIO = 0.075;

/**
 * Vị trí từng ô của trang mẫu TRONG ảnh thành phẩm, tính theo tỉ lệ (0 đến 1) của chiều rộng/cao ảnh thành phẩm.
 * Ảnh AI nằm ngay dưới đầu trang và có tỉ lệ khung đã yêu cầu (aspectRatio); phần chú giải và chân trang nằm dưới nó.
 */
export function cellRegions(input: {
  finalWidth: number;
  finalHeight: number;
  aspectRatio: string;
  cols: number;
  rows: number;
  count: number;
}): { index: number; left: number; top: number; width: number; height: number }[] {
  const { finalWidth: W, finalHeight: FH, cols, rows, count } = input;
  if (W <= 0 || FH <= 0) return [];
  const headerH = Math.round(W * HEADER_RATIO);
  let aiH = FH - headerH;
  try {
    const { w, h } = parseAspect(input.aspectRatio);
    aiH = Math.min(aiH, Math.round((W * h) / w));
  } catch {
    // tỉ lệ khung không đọc được: coi toàn bộ phần dưới đầu trang là ảnh AI
  }
  if (aiH <= 0 || count < 1 || count > cols * rows) return [];
  return computeCells({ width: W, height: aiH, cols, rows, count }).map((c) => ({
    index: c.index,
    left: c.x / W,
    top: (headerH + c.y) / FH,
    width: c.w / W,
    height: c.h / FH,
  }));
}
