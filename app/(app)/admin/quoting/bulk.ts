import { parseCmToMm, parseGrouped, parsePlain } from "./parse";

/**
 * Công cụ đổi hàng loạt cho tấm vật liệu (thuần, có test): tính bảng xem trước và đọc dữ liệu admin nhập.
 * Trình duyệt dùng để hiện bảng xem trước; máy chủ chạy LẠI đúng các hàm này trên dữ liệu thật trước khi lưu (không tin số từ trình duyệt).
 */

export const MAX_BULK_ROWS = 500;
const MAX_PRICE = 1_000_000_000_000;

/* ---------- Đổi giá tấm ---------- */

export type PriceChangeSpec = { mode: "set"; value: number } | { mode: "percent"; value: number; roundTo: number };

export type PriceSpecText = { mode: "set" | "percent"; value: string; roundTo: string };

export function parsePriceSpec(t: PriceSpecText): { ok: true; spec: PriceChangeSpec } | { error: string } {
  if (t.mode === "set") {
    const v = parseGrouped(t.value);
    if (v === null) return { error: "Chưa nhập giá tấm mới." };
    if (v === "invalid") return { error: "Giá tấm mới không phải số hợp lệ." };
    if (v <= 0) return { error: "Giá tấm mới phải lớn hơn 0." };
    if (v > MAX_PRICE) return { error: "Giá tấm mới quá lớn." };
    return { ok: true, spec: { mode: "set", value: v } };
  }
  if (t.mode !== "percent") return { error: "Cách đổi giá không hợp lệ." };
  const p = parsePlain(t.value);
  if (p === null) return { error: "Chưa nhập số phần trăm (ví dụ 5 để tăng 5%, -3 để giảm 3%)." };
  if (p === "invalid") return { error: "Số phần trăm không hợp lệ." };
  if (p <= -100) return { error: "Giảm không thể từ 100% trở lên." };
  if (p > 1000) return { error: "Tăng tối đa 1000%." };
  const r = parseGrouped(t.roundTo);
  if (r === "invalid") return { error: "Số làm tròn không phải số hợp lệ." };
  const roundTo = r ?? 1;
  if (!Number.isInteger(roundTo) || roundTo < 1 || roundTo > 1_000_000) return { error: "Làm tròn tới phải là số nguyên đồng từ 1 đến 1.000.000." };
  return { ok: true, spec: { mode: "percent", value: p, roundTo } };
}

export type PriceRowIn = { id: string; code: string; name: string; stockPrice: number | null };
export type PricePreviewStatus = "change" | "same" | "skip" | "error";
export type PricePreview = { id: string; code: string; name: string; oldPrice: number | null; newPrice: number | null; status: PricePreviewStatus; reason?: string };

/**
 * Giá mới của từng dòng.
 * - Đặt tuyệt đối: mọi dòng đều nhận giá mới (kể cả dòng chưa có giá).
 * - Theo %: dòng chưa có giá cũ thì BỎ QUA (không có gì để tăng giảm), báo rõ lý do.
 */
export function previewPriceChange(rows: PriceRowIn[], spec: PriceChangeSpec): PricePreview[] {
  return rows.map((r): PricePreview => {
    const base = { id: r.id, code: r.code, name: r.name, oldPrice: r.stockPrice };
    if (spec.mode === "set") {
      return { ...base, newPrice: spec.value, status: r.stockPrice === spec.value ? "same" : "change" };
    }
    if (r.stockPrice === null || r.stockPrice === undefined) {
      return { ...base, newPrice: null, status: "skip", reason: "Chưa có giá cũ nên bỏ qua." };
    }
    const next = Math.round((r.stockPrice * (1 + spec.value / 100)) / spec.roundTo) * spec.roundTo;
    if (!Number.isFinite(next) || next <= 0) return { ...base, newPrice: null, status: "error", reason: "Giá mới không hợp lệ (nhỏ hơn hoặc bằng 0)." };
    if (next > MAX_PRICE) return { ...base, newPrice: null, status: "error", reason: "Giá mới quá lớn." };
    return { ...base, newPrice: next, status: next === r.stockPrice ? "same" : "change" };
  });
}

/* ---------- Áp dụng cùng kích thước / lề / khoảng cách ---------- */

/** undefined = không đổi; riêng gapMm: null = xóa khoảng cách riêng (dùng mặc định chung). */
export type StockPatch = { widthMm?: number; heightMm?: number; edgeMarginMm?: number; gapMm?: number | null };

export type StockPatchText = { widthCm: string; heightCm: string; edgeMarginMm: string; gapMm: string; clearGap: boolean };

export function parseStockPatch(t: StockPatchText): { ok: true; patch: StockPatch } | { error: string } {
  const patch: StockPatch = {};
  const w = parseCmToMm(t.widthCm);
  if (w === "invalid") return { error: "Rộng tấm (cm) không phải số hợp lệ." };
  if (w !== null) {
    if (w <= 0) return { error: "Rộng tấm phải lớn hơn 0." };
    if (w > 100_000) return { error: "Rộng tấm tối đa 10.000 cm." };
    patch.widthMm = w;
  }
  const h = parseCmToMm(t.heightCm);
  if (h === "invalid") return { error: "Cao tấm (cm) không phải số hợp lệ." };
  if (h !== null) {
    if (h <= 0) return { error: "Cao tấm phải lớn hơn 0." };
    if (h > 100_000) return { error: "Cao tấm tối đa 10.000 cm." };
    patch.heightMm = h;
  }
  const e = parsePlain(t.edgeMarginMm);
  if (e === "invalid") return { error: "Lề tấm (mm) không phải số hợp lệ." };
  if (e !== null) {
    if (e < 0) return { error: "Lề tấm không được âm." };
    if (e > 10_000) return { error: "Lề tấm tối đa 10.000 mm." };
    patch.edgeMarginMm = e;
  }
  const g = parsePlain(t.gapMm);
  if (g === "invalid") return { error: "Khoảng cách (mm) không phải số hợp lệ." };
  if (g !== null) {
    if (t.clearGap) return { error: "Vừa nhập khoảng cách vừa chọn xóa khoảng cách riêng: hãy chọn một." };
    if (g < 0) return { error: "Khoảng cách không được âm." };
    if (g > 10_000) return { error: "Khoảng cách tối đa 10.000 mm." };
    patch.gapMm = g;
  } else if (t.clearGap) {
    patch.gapMm = null;
  }
  if (Object.keys(patch).length === 0) return { error: "Chưa nhập gì để áp dụng. Ô để trống nghĩa là giữ nguyên." };
  return { ok: true, patch };
}

export type StockFieldsIn = { stockWidthMm: number | null; stockHeightMm: number | null; edgeMarginMm: number | null; gapMm: number | null };
export type StockRowInForPatch = StockFieldsIn & { id: string; code: string; name: string };
export type StockPatchPreview = {
  id: string;
  code: string;
  name: string;
  before: StockFieldsIn;
  after: StockFieldsIn;
  /** các trường thật sự đổi giá trị */
  changed: (keyof StockFieldsIn)[];
};

export function previewStockPatch(rows: StockRowInForPatch[], patch: StockPatch): StockPatchPreview[] {
  return rows.map((r) => {
    const before: StockFieldsIn = { stockWidthMm: r.stockWidthMm, stockHeightMm: r.stockHeightMm, edgeMarginMm: r.edgeMarginMm, gapMm: r.gapMm };
    const after: StockFieldsIn = {
      stockWidthMm: patch.widthMm !== undefined ? patch.widthMm : r.stockWidthMm,
      stockHeightMm: patch.heightMm !== undefined ? patch.heightMm : r.stockHeightMm,
      edgeMarginMm: patch.edgeMarginMm !== undefined ? patch.edgeMarginMm : r.edgeMarginMm,
      gapMm: patch.gapMm !== undefined ? patch.gapMm : r.gapMm,
    };
    const changed = (Object.keys(after) as (keyof StockFieldsIn)[]).filter((k) => after[k] !== before[k]);
    return { id: r.id, code: r.code, name: r.name, before, after, changed };
  });
}
