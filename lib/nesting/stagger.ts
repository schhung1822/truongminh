import { fitCount, usableArea } from "./grid";
import { rotatePolygon90, shapesTooClose, translatePolygon, type Polygon } from "./geometry";
import type { NestingInput, NestingStrategy, Placement, StrategyResult } from "./types";

/**
 * Cấp 2: lưới so le. Hàng kế tiếp lệch nửa ô theo chiều ngang; khoảng cách giữa hai hàng tính theo hình học thật của
 * đường viền logo (logo gần tròn thì các hàng xích lại gần nhau hơn), kiểm tra không vi phạm khoảng cách tối thiểu.
 * Chỉ chạy khi có đường viền logo.
 */

const SCAN_STEPS = 48;
const BISECT_ROUNDS = 14;

/** Các bản sao ở hàng r (1..3) lệch ngang bao nhiêu so với hình gốc, chỉ những vị trí có thể chạm hình gốc. */
function neighborOffsets(r: number, pitch: number, width: number, gap: number): number[] {
  const out: number[] = [];
  for (let k = -4; k <= 4; k++) {
    if ((((k % 2) + 2) % 2) !== r % 2) continue; // hàng lẻ lệch nửa ô, hàng chẵn thẳng cột
    const ox = (k * pitch) / 2;
    if (Math.abs(ox) < width + gap) out.push(ox);
  }
  return out;
}

/** Khoảng cách dọc nhỏ nhất giữa hai hàng liền nhau mà không vi phạm `minDist`. Luôn có lời giải (<= h + gap). */
export function findRowPitch(shape: Polygon[], w: number, h: number, gap: number, minDist: number): number {
  const pitch = w + gap;
  const ok = (dy: number): boolean => {
    for (let r = 1; r <= 3; r++) {
      const oy = r * dy;
      if (oy >= h + gap) break; // khung bao đã cách nhau đủ khoảng cách: không thể vi phạm
      for (const ox of neighborOffsets(r, pitch, w, minDist)) {
        // khung bao là chính xác (đã cắt sát nội dung), nên hai khung bao cách nhau đủ gap thì hai logo chắc chắn đủ gap
        if (Math.max(Math.abs(ox) - w, oy - h) >= gap - 1e-9) continue;
        const moved = shape.map((p) => translatePolygon(p, ox, oy));
        if (shapesTooClose(shape, moved, minDist)) return false;
      }
    }
    return true;
  };

  const hi0 = h + gap;
  let lo = 0; // không khả thi
  let hi = hi0; // khả thi
  const step = hi0 / SCAN_STEPS;
  for (let i = 1; i <= SCAN_STEPS; i++) {
    const dy = Math.min(hi0, i * step);
    if (ok(dy)) {
      hi = dy;
      break;
    }
    lo = dy;
  }
  for (let i = 0; i < BISECT_ROUNDS; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function build(input: NestingInput, w: number, h: number, dy: number, parity: 0 | 1, rotation: 0 | 90): Placement[] {
  const u = usableArea(input);
  const m = input.edgeMarginMm;
  const dx = w + input.gapMm;
  if (u.height + 1e-9 < h || u.width + 1e-9 < w) return [];
  const rows = Math.floor((u.height - h) / dy + 1e-9) + 1;
  const out: Placement[] = [];
  for (let r = 0; r < rows; r++) {
    const off = ((r + parity) % 2) * (dx / 2);
    if (u.width - off + 1e-9 < w) continue;
    const n = Math.floor((u.width - off - w) / dx + 1e-9) + 1;
    for (let c = 0; c < n; c++) out.push({ x: m + off + c * dx, y: m + r * dy, width: w, height: h, rotation });
  }
  return out;
}

export function staggerGrid(rotation: 0 | 90): NestingStrategy {
  return {
    id: rotation === 0 ? "stagger-0" : "stagger-90",
    complexity: rotation === 0 ? 4 : 5,
    run(input): StrategyResult | null {
      if (!input.contour || input.contour.outers.length === 0) return null;
      if (rotation === 90 && !input.allowRotate) return null;
      const w = rotation === 0 ? input.logoWidthMm : input.logoHeightMm;
      const h = rotation === 0 ? input.logoHeightMm : input.logoWidthMm;
      const shape = rotation === 0 ? input.contour.outers : input.contour.outers.map((p) => rotatePolygon90(p, input.logoHeightMm));
      const u = usableArea(input);
      if (fitCount(u.width, w, input.gapMm) === 0 || fitCount(u.height, h, input.gapMm) === 0) return null;

      // cộng sai số đơn giản hóa để chắc chắn đủ khoảng cách thật
      const minDist = input.gapMm + input.contour.toleranceMm;
      const dy = findRowPitch(shape, w, h, input.gapMm, minDist);
      if (!(dy > 0)) return null;

      const a = build(input, w, h, dy, 0, rotation);
      const b = build(input, w, h, dy, 1, rotation);
      const placements = b.length > a.length ? b : a;
      if (placements.length === 0) return null;
      return { placements, label: `Lưới so le${rotation === 90 ? " xoay 90°" : ""} (khoảng cách hàng ${Math.round(dy * 10) / 10} mm)` };
    },
  };
}
