import { markupFor } from "@/lib/quoting/config";
import { quoteSettingsSchema, type QuoteSettingsInput } from "@/lib/quoting/schemas";
import { LAST_SHEET_POLICIES, type LastSheetPolicy, type MarginTier, type QuoteConfig } from "@/lib/quoting/types";
import { groupDigits, numToText } from "./format";
import { parseGrouped, parsePlain } from "./parse";

/**
 * Form Cấu hình giá: đổi ô nhập (chữ) sang dữ liệu đúng quoteSettingsSchema, và kiểm tra bảng bậc lãi TỪNG DÒNG để báo lỗi đúng dòng. Thuần, có test.
 * Lần đầu mọi ô trống: không có giá trị mặc định nào.
 */

export type TierRaw = { fromQty: string; toQty: string; markupPct: string };

export type SettingsRaw = {
  defaultGapMm: string;
  lastSheetPolicy: "" | LastSheetPolicy;
  roundTo: string;
  /** "50, 100, 200, 500, 1000" */
  quantities: string;
  engrave: { IT: string; VUA: string; NHIEU: string };
  tiers: TierRaw[];
};

export const MAX_TIERS = 20;
export const MAX_QUANTITIES = 12;

export function configToRaw(c: QuoteConfig): SettingsRaw {
  return {
    defaultGapMm: numToText(c.defaultGapMm),
    lastSheetPolicy: c.lastSheetPolicy ?? "",
    roundTo: numToText(c.roundTo),
    quantities: c.quantities.map((q) => String(q)).join(", "),
    engrave: { IT: numToText(c.engravePct.IT ?? null), VUA: numToText(c.engravePct.VUA ?? null), NHIEU: numToText(c.engravePct.NHIEU ?? null) },
    tiers: c.marginTiers.map((t) => ({ fromQty: String(t.fromQty), toQty: t.toQty === null ? "" : String(t.toQty), markupPct: numToText(t.markupPct) })),
  };
}

/** "50, 100; 200 1.000" → [50, 100, 200, 1000]. Sai thì trả về lỗi. Không sắp xếp và không bỏ trùng (store làm việc đó). */
export function parseQuantityList(text: string): { ok: true; values: number[] } | { error: string } {
  const tokens = text.split(/[,;\s]+/).filter((t) => t !== "");
  const values: number[] = [];
  for (const tok of tokens) {
    const n = parseGrouped(tok);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10_000_000) return { error: `Mốc số lượng "${tok}" không hợp lệ: phải là số nguyên từ 1 đến 10.000.000.` };
    values.push(n);
  }
  return { ok: true, values };
}

/* ---------- Bảng bậc lãi ---------- */

const isBlankTier = (t: TierRaw) => t.fromQty.trim() === "" && t.toQty.trim() === "" && t.markupPct.trim() === "";

export type TierCheck = {
  /** lỗi theo từng dòng của form (cùng thứ tự); null = dòng ổn hoặc dòng trống bị bỏ qua */
  rowErrors: (string | null)[];
  /** các bậc đã đọc được, theo thứ tự dòng (bỏ dòng trống); rỗng nếu có lỗi */
  tiers: MarginTier[];
  ok: boolean;
};

/**
 * Đọc và kiểm tra bảng bậc lãi, báo lỗi ĐÚNG DÒNG: thiếu ô, số sai, "đến" nhỏ hơn "từ", chồng bậc, hở bậc, bậc không phải cuối mà bỏ trống "đến".
 * Kết quả cuối cùng vẫn được quoteSettingsSchema kiểm lại ở máy chủ.
 */
export function checkTierRows(rows: TierRaw[]): TierCheck {
  const rowErrors: (string | null)[] = rows.map(() => null);
  type Parsed = { index: number; fromQty: number; toQty: number | null; markupPct: number };
  const parsed: Parsed[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (isBlankTier(r)) continue;
    const from = parseGrouped(r.fromQty);
    if (from === null) {
      rowErrors[i] = 'Chưa nhập "Từ SL".';
      continue;
    }
    if (typeof from !== "number" || !Number.isInteger(from) || from < 1) {
      rowErrors[i] = '"Từ SL" phải là số nguyên từ 1.';
      continue;
    }
    let to: number | null = null;
    if (r.toQty.trim() !== "") {
      const t = parseGrouped(r.toQty);
      if (typeof t !== "number" || !Number.isInteger(t) || t < 1) {
        rowErrors[i] = '"Đến SL" phải là số nguyên từ 1, hoặc để trống nếu không giới hạn.';
        continue;
      }
      if (t < from) {
        rowErrors[i] = `"Đến SL" (${groupDigits(t)}) phải lớn hơn hoặc bằng "Từ SL" (${groupDigits(from)}).`;
        continue;
      }
      to = t;
    }
    const pct = parsePlain(r.markupPct);
    if (pct === null) {
      rowErrors[i] = "Chưa nhập lãi cộng thêm.";
      continue;
    }
    if (typeof pct !== "number") {
      rowErrors[i] = "Lãi cộng thêm không phải số hợp lệ.";
      continue;
    }
    if (pct < 0 || pct > 1000) {
      rowErrors[i] = "Lãi cộng thêm phải từ 0 đến 1000%.";
      continue;
    }
    parsed.push({ index: i, fromQty: from, toQty: to, markupPct: pct });
  }

  // chồng / hở / bỏ trống "đến" ở bậc không phải cuối (chỉ xét các dòng đã đọc được)
  const sorted = [...parsed].sort((a, b) => a.fromQty - b.fromQty);
  for (let k = 0; k < sorted.length - 1; k++) {
    const t = sorted[k];
    const next = sorted[k + 1];
    if (t.toQty === null) {
      rowErrors[t.index] ??= `Chỉ dòng cuối cùng mới được để trống "Đến SL". Dòng này bắt đầu từ ${groupDigits(t.fromQty)} nhưng phía sau còn bậc bắt đầu từ ${groupDigits(next.fromQty)}.`;
    } else if (next.fromQty <= t.toQty) {
      rowErrors[next.index] ??= `Chồng lên bậc ${groupDigits(t.fromQty)} đến ${groupDigits(t.toQty)}: bắt đầu từ ${groupDigits(next.fromQty)} nhưng bậc trước đã tới ${groupDigits(t.toQty)}.`;
    } else if (next.fromQty > t.toQty + 1) {
      rowErrors[next.index] ??= `Hở bậc: số lượng từ ${groupDigits(t.toQty + 1)} đến ${groupDigits(next.fromQty - 1)} chưa có lãi.`;
    }
  }

  const hasError = rowErrors.some((e) => e !== null);
  return {
    rowErrors,
    ok: !hasError,
    tiers: hasError ? [] : parsed.map((p) => ({ fromQty: p.fromQty, toQty: p.toQty, markupPct: p.markupPct })),
  };
}

/** Mốc số lượng chưa có bậc lãi nào phủ tới (để nhắc ngay trên form). */
export function uncoveredQuantities(quantities: number[], tiers: MarginTier[]): number[] {
  if (tiers.length === 0) return [];
  return quantities.filter((q) => markupFor(tiers, q) === null);
}

/* ---------- Toàn form ---------- */

export type SettingsResult = { ok: true; input: QuoteSettingsInput } | { error: string; tierErrors?: (string | null)[] };

export function settingsRawToInput(raw: SettingsRaw): SettingsResult {
  const gap = parsePlain(raw.defaultGapMm);
  if (gap === "invalid") return { error: "Khoảng cách mặc định (mm) không phải số hợp lệ." };
  const round = parseGrouped(raw.roundTo);
  if (round === "invalid") return { error: "Làm tròn đơn giá (đồng) không phải số hợp lệ." };
  if (raw.lastSheetPolicy !== "" && !(LAST_SHEET_POLICIES as readonly string[]).includes(raw.lastSheetPolicy)) return { error: "Chính sách tấm cuối không hợp lệ." };

  const q = parseQuantityList(raw.quantities);
  if ("error" in q) return q;
  const engrave: Record<"IT" | "VUA" | "NHIEU", number | null> = { IT: null, VUA: null, NHIEU: null };
  for (const [k, label] of [["IT", "Khắc ít"], ["VUA", "Khắc vừa"], ["NHIEU", "Khắc nhiều"]] as const) {
    const v = parsePlain(raw.engrave[k]);
    if (v === "invalid") return { error: `% diện tích khắc của mức "${label}" không phải số hợp lệ.` };
    engrave[k] = v;
  }

  if (raw.tiers.length > MAX_TIERS) return { error: `Tối đa ${MAX_TIERS} bậc lãi.` };
  const tc = checkTierRows(raw.tiers);
  if (!tc.ok) {
    const first = tc.rowErrors.findIndex((e) => e !== null);
    return { error: `Bảng bậc lãi, dòng ${first + 1}: ${tc.rowErrors[first]}`, tierErrors: tc.rowErrors };
  }

  const parsed = quoteSettingsSchema.safeParse({
    defaultGapMm: gap,
    lastSheetPolicy: raw.lastSheetPolicy === "" ? null : raw.lastSheetPolicy,
    marginTiers: tc.tiers,
    displayQuantities: q.values,
    roundTo: round,
    engraveLevels: engrave,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  return { ok: true, input: parsed.data };
}
