import { hybridGrid, nest, straightGrid, type NestingInput } from "@/lib/nesting";

/**
 * Gợi ý đổi kích thước logo một chút để xếp được nhiều logo hơn trên mỗi tấm (ví dụ 5 cm xếp 54 cái, 4,8 cm xếp 70 cái).
 * So sánh công bằng bằng cùng bộ phương án lưới (không so le) cho cả kích thước gốc và kích thước thử.
 */

export type SizeSuggestion = {
  widthMm: number;
  heightMm: number;
  perSheet: number;
  /** so với kích thước gốc, % */
  changePct: number;
  gainPct: number;
};

const STRATEGIES = [straightGrid(0), straightGrid(90), hybridGrid];

export function suggestSizes(base: NestingInput, opts?: { maxChangePct?: number; minGainPct?: number; minGainCount?: number; limit?: number }): SizeSuggestion[] {
  const maxChange = opts?.maxChangePct ?? 10;
  const minGain = opts?.minGainPct ?? 10;
  const minCount = opts?.minGainCount ?? 2;
  const limit = opts?.limit ?? 3;
  const baseCount = nest({ ...base, contour: undefined }, STRATEGIES).count;
  if (baseCount === 0) return [];

  const best = new Map<number, SizeSuggestion>(); // theo số logo/tấm: giữ mức đổi nhỏ nhất
  for (let k = 1; k <= maxChange * 2; k++) {
    for (const sign of [-1, 1]) {
      const changePct = sign * k * 0.5;
      const f = 1 + changePct / 100;
      const w = Math.round(base.logoWidthMm * f * 10) / 10;
      const h = Math.round(base.logoHeightMm * f * 10) / 10;
      if (w <= 0 || h <= 0 || (w === base.logoWidthMm && h === base.logoHeightMm)) continue;
      const count = nest({ ...base, logoWidthMm: w, logoHeightMm: h, contour: undefined, logoAreaMm2: undefined }, STRATEGIES).count;
      if (count < baseCount + minCount || (count - baseCount) * 100 < baseCount * minGain) continue;
      const prev = best.get(count);
      if (!prev || Math.abs(changePct) < Math.abs(prev.changePct)) {
        best.set(count, { widthMm: w, heightMm: h, perSheet: count, changePct, gainPct: ((count - baseCount) * 100) / baseCount });
      }
    }
  }
  // ưu tiên đổi ít nhất; chỉ giữ các mức thật sự khác nhau về số logo
  return [...best.values()].sort((a, b) => Math.abs(a.changePct) - Math.abs(b.changePct) || b.perSheet - a.perSheet).slice(0, limit);
}
