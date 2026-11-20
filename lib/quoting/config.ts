import { ENGRAVE_LEVELS, isEngraveLevel, LAST_SHEET_POLICIES, type EngraveLevel, type LastSheetPolicy, type MarginTier, type QuoteConfig } from "./types";

/**
 * Đọc và kiểm tra cấu hình báo giá từ dữ liệu thô (cột JSON của CSDL). Thuần, có test.
 * Dữ liệu hỏng hoặc thiếu thì trả về rỗng (coi như chưa có dữ liệu), không bao giờ tự bịa giá trị.
 */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseMarginTiers(raw: unknown): MarginTier[] {
  if (!Array.isArray(raw)) return [];
  const out: MarginTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const from = num(o.fromQty);
    const to = o.toQty === null || o.toQty === undefined || o.toQty === "" ? null : num(o.toQty);
    const pct = num(o.markupPct);
    if (from === null || pct === null || !Number.isInteger(from) || from < 1) continue;
    if (to !== null && (!Number.isInteger(to) || to < from)) continue;
    out.push({ fromQty: from, toQty: to, markupPct: pct });
  }
  return out.sort((a, b) => a.fromQty - b.fromQty);
}

export function parseQuantities(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const v of raw) {
    const n = num(v);
    if (n !== null && Number.isInteger(n) && n >= 1 && n <= 10_000_000) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export function parseEngravePct(raw: unknown): QuoteConfig["engravePct"] {
  const out: QuoteConfig["engravePct"] = {};
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const level of ENGRAVE_LEVELS) {
    if (level === "KHONG_KHAC") continue;
    const n = num(o[level]);
    if (n !== null && n >= 0 && n <= 100) out[level] = n;
  }
  return out;
}

export type RawQuoteConfig = {
  defaultGapMm: unknown;
  lastSheetPolicy: unknown;
  marginTiers: unknown;
  displayQuantities: unknown;
  roundTo: unknown;
  engraveLevels: unknown;
};

export function parseQuoteConfig(raw: RawQuoteConfig | null | undefined): QuoteConfig {
  if (!raw) return { defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], quantities: [], roundTo: null, engravePct: {} };
  const gap = num(raw.defaultGapMm);
  const round = num(raw.roundTo);
  return {
    defaultGapMm: gap !== null && gap >= 0 ? gap : null,
    lastSheetPolicy: (LAST_SHEET_POLICIES as readonly unknown[]).includes(raw.lastSheetPolicy) ? (raw.lastSheetPolicy as LastSheetPolicy) : null,
    marginTiers: parseMarginTiers(raw.marginTiers),
    quantities: parseQuantities(raw.displayQuantities),
    roundTo: round !== null && Number.isInteger(round) && round >= 1 ? round : null,
    engravePct: parseEngravePct(raw.engraveLevels),
  };
}

/** Kiểm tra các bậc lãi: không chồng nhau, không để hở giữa các bậc. Trả về lời báo lỗi đầu tiên hoặc null. */
export function validateMarginTiers(tiers: MarginTier[]): string | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.fromQty - b.fromQty);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (!Number.isInteger(t.fromQty) || t.fromQty < 1) return "Số lượng bắt đầu của mỗi bậc phải là số nguyên từ 1.";
    if (t.toQty !== null && (!Number.isInteger(t.toQty) || t.toQty < t.fromQty)) return `Bậc ${t.fromQty}: số lượng kết thúc phải lớn hơn hoặc bằng số lượng bắt đầu.`;
    if (!Number.isFinite(t.markupPct) || t.markupPct < 0 || t.markupPct > 1000) return `Bậc ${t.fromQty}: lãi cộng thêm phải từ 0 đến 1000%.`;
    const next = sorted[i + 1];
    if (next) {
      if (t.toQty === null) return "Chỉ bậc cuối cùng mới được để trống số lượng kết thúc.";
      if (next.fromQty <= t.toQty) return `Bậc ${t.fromQty}-${t.toQty} chồng lên bậc bắt đầu từ ${next.fromQty}.`;
      if (next.fromQty > t.toQty + 1) return `Có khoảng hở giữa bậc ${t.fromQty}-${t.toQty} và bậc ${next.fromQty}: số lượng ${t.toQty + 1} đến ${next.fromQty - 1} chưa có lãi.`;
    }
  }
  return null;
}

/** Bậc lãi áp dụng cho một số lượng, hoặc null nếu chưa có bậc nào phủ số lượng đó. */
export function markupFor(tiers: MarginTier[], qty: number): number | null {
  const t = tiers.find((x) => qty >= x.fromQty && (x.toQty === null || qty <= x.toQty));
  return t ? t.markupPct : null;
}

export const engraveShare = (cfg: QuoteConfig, level: EngraveLevel): number | null => (level === "KHONG_KHAC" ? 0 : (cfg.engravePct[level] ?? null));

export { isEngraveLevel };
