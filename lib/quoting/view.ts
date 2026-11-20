import type { Placement } from "@/lib/nesting";
import { MISSING_MESSAGE } from "./missing";
import type { ParamsSnapshot, QuoteComputation } from "./quote";
import type { MissingParam, QuoteLine, QuoteLineFull } from "./types";

/**
 * Hai góc nhìn của kết quả báo giá. Phân quyền được làm ở đây, trên máy chủ, TRƯỚC KHI dữ liệu đi đâu cả:
 *  - SaleQuoteView: số logo/tấm, số tấm, hiệu suất, phút máy, đơn giá, thành tiền. KHÔNG có giá vốn, lãi, giá tấm, thông số máy, công thức.
 *  - AdminQuoteView: tất cả những thứ trên cộng chi tiết giá vốn từng mốc và thông số đã dùng.
 * Mỗi view được dựng từng trường một (danh sách trắng), không bao giờ sao chép nguyên đối tượng tính toán.
 */

export type LayoutView = {
  strategy: string;
  label: string;
  stock: { widthMm: number; heightMm: number; edgeMarginMm: number; gapMm: number };
  placements: Placement[];
  candidates: { strategy: string; label: string; count: number; efficiencyPct: number }[];
};

export type SaleQuoteView =
  | {
      ok: true;
      perSheet: number;
      efficiencyPct: number;
      layout: LayoutView;
      lines: QuoteLine[];
      warnings: string[];
    }
  | { ok: false; reason: "MISSING"; message: string; missing: MissingParam[] }
  | { ok: false; reason: "NESTING"; error: string };

export type AdminQuoteView =
  | (Extract<SaleQuoteView, { ok: true }> & { lines: QuoteLineFull[]; params: ParamsSnapshot })
  | Extract<SaleQuoteView, { ok: false }>;

function layoutOf(c: Extract<QuoteComputation, { ok: true }>): LayoutView {
  return {
    strategy: c.nesting.strategy,
    label: c.nesting.label,
    stock: { ...c.stock },
    placements: c.nesting.placements.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation })),
    candidates: c.nesting.candidates.map((k) => ({ strategy: k.strategy, label: k.label, count: k.count, efficiencyPct: k.efficiencyPct })),
  };
}

function failure(c: Exclude<QuoteComputation, { ok: true }>): Extract<SaleQuoteView, { ok: false }> {
  if (c.reason === "MISSING") {
    return { ok: false, reason: "MISSING", message: MISSING_MESSAGE, missing: c.missing.map((m) => ({ code: m.code, label: m.label, scope: m.scope, hint: m.hint })) };
  }
  return { ok: false, reason: "NESTING", error: c.error };
}

export function toSaleView(c: QuoteComputation): SaleQuoteView {
  if (!c.ok) return failure(c);
  return {
    ok: true,
    perSheet: c.perSheet,
    efficiencyPct: c.efficiencyPct,
    layout: layoutOf(c),
    lines: c.lines.map((l) => ({ quantity: l.quantity, sheetsNeeded: l.sheetsNeeded, machineMinutes: l.machineMinutes, unitPrice: l.unitPrice, totalPrice: l.totalPrice })),
    warnings: [...c.warnings],
  };
}

export function toAdminView(c: QuoteComputation): AdminQuoteView {
  if (!c.ok) return failure(c);
  const sale = toSaleView(c) as Extract<SaleQuoteView, { ok: true }>;
  return { ...sale, lines: c.lines, params: c.params };
}

/** Bảng giá gửi khách: chỉ số lượng, đơn giá, thành tiền. */
export function customerPriceText(lines: QuoteLine[], opts?: { title?: string }): string {
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  const rows = lines.map((l) => `${fmt(l.quantity)} cái: ${fmt(l.unitPrice)} đ/cái, thành tiền ${fmt(l.totalPrice)} đ`);
  return [opts?.title, ...rows].filter(Boolean).join("\n");
}
