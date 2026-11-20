import type { NestingInput, NestingStrategy, Placement, StrategyResult } from "./types";

/**
 * Cấp 1: xếp theo khung bao chữ nhật.
 *  - lưới thẳng 0 độ hoặc 90 độ;
 *  - xếp lai: một khối lưới theo hướng này, hai dải thừa (bên phải, bên dưới) lấp bằng hướng còn lại.
 */

const TOL = 1e-9;

/** Vùng dùng được của tấm (đã trừ lề). */
export function usableArea(input: NestingInput): { width: number; height: number } {
  return {
    width: input.stockWidthMm - 2 * input.edgeMarginMm,
    height: input.stockHeightMm - 2 * input.edgeMarginMm,
  };
}

/** Một hàng/cột xếp được bao nhiêu phần tử kích thước `size` trong chiều dài `avail`, cách nhau `gap`. */
export function fitCount(avail: number, size: number, gap: number): number {
  if (!(avail > 0) || size <= 0 || avail + TOL < size) return 0;
  return Math.floor((avail + gap) / (size + gap) + TOL);
}

type Region = { x: number; y: number; width: number; height: number };

function gridPlacements(region: Region, w: number, h: number, gap: number, rotation: 0 | 90, maxCols?: number, maxRows?: number): Placement[] {
  const cols = Math.min(fitCount(region.width, w, gap), maxCols ?? Infinity);
  const rows = Math.min(fitCount(region.height, h, gap), maxRows ?? Infinity);
  const out: Placement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: region.x + c * (w + gap), y: region.y + r * (h + gap), width: w, height: h, rotation });
    }
  }
  return out;
}

function gridCount(width: number, height: number, w: number, h: number, gap: number): number {
  return fitCount(width, w, gap) * fitCount(height, h, gap);
}

/** Lưới thẳng một hướng. */
export function straightGrid(rotation: 0 | 90): NestingStrategy {
  return {
    id: rotation === 0 ? "grid-0" : "grid-90",
    complexity: rotation === 0 ? 1 : 2,
    run(input): StrategyResult | null {
      if (rotation === 90 && !input.allowRotate) return null;
      const w = rotation === 0 ? input.logoWidthMm : input.logoHeightMm;
      const h = rotation === 0 ? input.logoHeightMm : input.logoWidthMm;
      const u = usableArea(input);
      const placements = gridPlacements({ x: input.edgeMarginMm, y: input.edgeMarginMm, width: u.width, height: u.height }, w, h, input.gapMm, rotation);
      if (placements.length === 0) return null;
      const cols = fitCount(u.width, w, input.gapMm);
      const rows = fitCount(u.height, h, input.gapMm);
      return { placements, label: `Lưới thẳng ${cols} x ${rows}${rotation === 90 ? " (xoay 90°)" : ""}` };
    },
  };
}

const MAX_COMBOS = 400_000;

/**
 * Xếp lai. Thử mọi cỡ khối chính (c cột x r hàng) ở mỗi hướng, và hai cách chia dải thừa:
 *  (a) dải bên phải chạy suốt chiều cao, dải bên dưới chỉ nằm dưới khối chính;
 *  (b) dải bên dưới chạy suốt chiều rộng, dải bên phải chỉ nằm cạnh khối chính.
 * Hai dải được lấp bằng hướng còn lại. Chỉ chạy khi cho xoay.
 */
export const hybridGrid: NestingStrategy = {
  id: "hybrid",
  complexity: 3,
  run(input): StrategyResult | null {
    if (!input.allowRotate) return null;
    const gap = input.gapMm;
    const m = input.edgeMarginMm;
    const u = usableArea(input);
    const a0 = { w: input.logoWidthMm, h: input.logoHeightMm };
    const a90 = { w: input.logoHeightMm, h: input.logoWidthMm };

    let best: { count: number; main: 0 | 90; c: number; r: number; part: "a" | "b" } | null = null;
    for (const main of [0, 90] as const) {
      const A = main === 0 ? a0 : a90;
      const B = main === 0 ? a90 : a0;
      const maxC = fitCount(u.width, A.w, gap);
      const maxR = fitCount(u.height, A.h, gap);
      if (maxC === 0 || maxR === 0 || maxC * maxR > MAX_COMBOS) continue;
      for (let c = 1; c <= maxC; c++) {
        const usedW = c * (A.w + gap);
        for (let r = 1; r <= maxR; r++) {
          const usedH = r * (A.h + gap);
          const mainW = usedW - gap;
          const mainH = usedH - gap;
          const rightW = u.width - usedW;
          const bottomH = u.height - usedH;
          // (a) dải phải suốt chiều cao, dải dưới chỉ dưới khối chính
          const ca = c * r + gridCount(rightW, u.height, B.w, B.h, gap) + gridCount(mainW, bottomH, B.w, B.h, gap);
          // (b) dải dưới suốt chiều rộng, dải phải chỉ cạnh khối chính
          const cb = c * r + gridCount(u.width, bottomH, B.w, B.h, gap) + gridCount(rightW, mainH, B.w, B.h, gap);
          if (!best || ca > best.count) best = { count: ca, main, c, r, part: "a" };
          if (cb > best.count) best = { count: cb, main, c, r, part: "b" };
        }
      }
    }
    if (!best || best.count === 0) return null;

    const A = best.main === 0 ? a0 : a90;
    const B = best.main === 0 ? a90 : a0;
    const rotA = best.main;
    const rotB: 0 | 90 = best.main === 0 ? 90 : 0;
    const usedW = best.c * (A.w + gap);
    const usedH = best.r * (A.h + gap);
    const mainW = usedW - gap;
    const mainH = usedH - gap;
    const placements = gridPlacements({ x: m, y: m, width: mainW, height: mainH }, A.w, A.h, gap, rotA);
    const right: Region =
      best.part === "a"
        ? { x: m + usedW, y: m, width: u.width - usedW, height: u.height }
        : { x: m + usedW, y: m, width: u.width - usedW, height: mainH };
    const bottom: Region =
      best.part === "a"
        ? { x: m, y: m + usedH, width: mainW, height: u.height - usedH }
        : { x: m, y: m + usedH, width: u.width, height: u.height - usedH };
    placements.push(...gridPlacements(right, B.w, B.h, gap, rotB), ...gridPlacements(bottom, B.w, B.h, gap, rotB));
    const extra = placements.length - best.c * best.r;
    return {
      placements,
      label: `Xếp lai: khối ${best.c} x ${best.r} ${best.main === 0 ? "hướng gốc" : "xoay 90°"} + ${extra} logo ở dải thừa theo hướng ${best.main === 0 ? "xoay 90°" : "gốc"}`,
    };
  },
};
