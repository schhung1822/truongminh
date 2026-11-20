import { materialStockSchema, type MaterialStockInput } from "@/lib/quoting/schemas";
import { mmToCm, numToText, groupDigits } from "./format";
import { parseCmToMm, parseGrouped, parsePlain, type Parsed } from "./parse";

/**
 * Chuyển ô nhập của một dòng chất liệu (chữ, đơn vị cm / mm / đồng) sang dữ liệu đúng schema (mm, đồng) và kiểm tra bằng materialStockSchema.
 * Thuần, có test. Máy chủ gọi lại hàm này; trình duyệt chỉ dùng để dựng và so sánh ô nhập.
 */

export type StockRaw = {
  widthCm: string;
  heightCm: string;
  /** đồng, có thể gõ "1.500.000" */
  price: string;
  edgeMarginMm: string;
  gapMm: string;
  allowRotate: boolean;
};

export type StockValues = {
  stockWidthMm: number | null;
  stockHeightMm: number | null;
  stockPrice: number | null;
  edgeMarginMm: number | null;
  gapMm: number | null;
  allowRotate: boolean;
};

/** Giá trị đang lưu (mm, đồng) → ô nhập (cm, mm, đồng có dấu chấm ngăn nghìn). Trống giữ trống. */
export function stockToRaw(v: StockValues): StockRaw {
  return {
    widthCm: v.stockWidthMm === null ? "" : numToText(mmToCm(v.stockWidthMm)),
    heightCm: v.stockHeightMm === null ? "" : numToText(mmToCm(v.stockHeightMm)),
    price: v.stockPrice === null ? "" : groupDigits(v.stockPrice, 2),
    edgeMarginMm: v.edgeMarginMm === null ? "" : numToText(v.edgeMarginMm),
    gapMm: v.gapMm === null ? "" : numToText(v.gapMm),
    allowRotate: v.allowRotate,
  };
}

export function sameRaw(a: StockRaw, b: StockRaw): boolean {
  return a.widthCm === b.widthCm && a.heightCm === b.heightCm && a.price === b.price && a.edgeMarginMm === b.edgeMarginMm && a.gapMm === b.gapMm && a.allowRotate === b.allowRotate;
}

function bad(label: string): { error: string } {
  return { error: `${label}: không phải số hợp lệ.` };
}

const num = (p: Parsed): number | null => (typeof p === "number" ? p : null);

export function stockRawToInput(raw: StockRaw): { ok: true; input: MaterialStockInput } | { error: string } {
  const w = parseCmToMm(raw.widthCm);
  if (w === "invalid") return bad("Rộng tấm (cm)");
  const h = parseCmToMm(raw.heightCm);
  if (h === "invalid") return bad("Cao tấm (cm)");
  const price = parseGrouped(raw.price);
  if (price === "invalid") return bad("Giá tấm (đồng)");
  const edge = parsePlain(raw.edgeMarginMm);
  if (edge === "invalid") return bad("Lề tấm (mm)");
  const gap = parsePlain(raw.gapMm);
  if (gap === "invalid") return bad("Khoảng cách (mm)");
  // giới hạn nói bằng cm cho khỏi nhầm đơn vị (schema tính bằng mm)
  if (num(w) !== null && num(w)! > 100_000) return { error: "Rộng tấm (cm): tối đa 10.000 cm." };
  if (num(h) !== null && num(h)! > 100_000) return { error: "Cao tấm (cm): tối đa 10.000 cm." };

  const parsed = materialStockSchema.safeParse({
    stockWidthMm: num(w),
    stockHeightMm: num(h),
    stockPrice: num(price),
    edgeMarginMm: num(edge),
    gapMm: num(gap),
    allowRotate: raw.allowRotate === true,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  return { ok: true, input: parsed.data };
}
