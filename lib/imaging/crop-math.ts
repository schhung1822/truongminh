/**
 * Phép tính thuần cho hộp thoại xoay/cắt ảnh mẫu chất liệu (components/materials/image-editor-dialog.tsx),
 * không đụng tới canvas/DOM nên dễ kiểm thử (theo đúng quy ước của lib/grid/layout.ts).
 */

export type Rotation = 0 | 90 | 180 | 270;
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Handle = "nw" | "ne" | "sw" | "se";

/** Kích thước ảnh sau khi xoay 0/90/180/270 độ (90 và 270 đổi chỗ rộng/cao). */
export function rotatedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270 ? { w: size.h, h: size.w } : { w: size.w, h: size.h };
}

/** Khung cắt mặc định: trọn vẹn ảnh. */
export function fullRect(size: Size): Rect {
  return { x: 0, y: 0, w: size.w, h: size.h };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Kẹp một khung cắt vào trong khung ảnh `bounds`, không nhỏ hơn `minSize` (trừ khi bounds nhỏ hơn minSize). */
export function clampRect(rect: Rect, bounds: Size, minSize = 1): Rect {
  const w = clamp(rect.w, Math.min(minSize, bounds.w), bounds.w);
  const h = clamp(rect.h, Math.min(minSize, bounds.h), bounds.h);
  const x = clamp(rect.x, 0, bounds.w - w);
  const y = clamp(rect.y, 0, bounds.h - h);
  return { x, y, w, h };
}

/** Kéo di chuyển cả khung cắt (giữ nguyên kích thước), kẹp trong khung ảnh. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, bounds.w - rect.w),
    y: clamp(rect.y + dy, 0, bounds.h - rect.h),
  };
}

/** Góc đối diện (cố định) của một tay cầm resize. */
function anchorOf(rect: Rect, handle: Handle): { x: number; y: number } {
  switch (handle) {
    case "nw":
      return { x: rect.x + rect.w, y: rect.y + rect.h };
    case "ne":
      return { x: rect.x, y: rect.y + rect.h };
    case "sw":
      return { x: rect.x + rect.w, y: rect.y };
    case "se":
      return { x: rect.x, y: rect.y };
  }
}

/** Góc đang kéo của một tay cầm resize. */
function movingCornerOf(rect: Rect, handle: Handle): { x: number; y: number } {
  switch (handle) {
    case "nw":
      return { x: rect.x, y: rect.y };
    case "ne":
      return { x: rect.x + rect.w, y: rect.y };
    case "sw":
      return { x: rect.x, y: rect.y + rect.h };
    case "se":
      return { x: rect.x + rect.w, y: rect.y + rect.h };
  }
}

/** Đẩy tọa độ đang kéo ra xa điểm neo ít nhất `min`, rồi kẹp vào [lo, hi]. */
function enforceMin(anchorCoord: number, movingCoord: number, min: number, lo: number, hi: number): number {
  const sign = movingCoord >= anchorCoord ? 1 : -1;
  let v = Math.abs(movingCoord - anchorCoord) < min ? anchorCoord + sign * min : movingCoord;
  v = clamp(v, lo, hi);
  return v;
}

/**
 * Kéo một trong 4 góc để đổi kích thước khung cắt: góc đối diện đứng yên, góc đang kéo di chuyển theo (dx, dy)
 * rồi bị kẹp trong khung ảnh `bounds` và không nhỏ hơn `minSize` (trừ khi bounds nhỏ hơn minSize ở phía đó).
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, bounds: Size, minSize = 1): Rect {
  const anchor = anchorOf(rect, handle);
  const moving = movingCornerOf(rect, handle);
  let mx = clamp(moving.x + dx, 0, bounds.w);
  let my = clamp(moving.y + dy, 0, bounds.h);
  mx = enforceMin(anchor.x, mx, Math.min(minSize, bounds.w), 0, bounds.w);
  my = enforceMin(anchor.y, my, Math.min(minSize, bounds.h), 0, bounds.h);
  return {
    x: Math.min(anchor.x, mx),
    y: Math.min(anchor.y, my),
    w: Math.abs(anchor.x - mx),
    h: Math.abs(anchor.y - my),
  };
}
