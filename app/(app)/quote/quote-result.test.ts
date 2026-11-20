import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteResponse } from "@/lib/quoting/store";
import type { AdminQuoteView, SaleQuoteView } from "@/lib/quoting/view";
import { QuoteResultView } from "./quote-result";

// Dữ liệu giả chỉ để kiểm tra giao diện (không phải số liệu giá thật).
const placements = Array.from({ length: 6 }, (_, i) => ({ x: 10 + i * 50, y: 10, width: 47, height: 47, rotation: (i === 0 ? 90 : 0) as 0 | 90 }));
const layout = {
  strategy: "grid",
  label: "Lưới thẳng 6 x 1",
  stock: { widthMm: 400, heightMm: 100, edgeMarginMm: 10, gapMm: 3 },
  placements,
  candidates: [
    { strategy: "grid", label: "Lưới thẳng 6 x 1", count: 6, efficiencyPct: 55.5 },
    { strategy: "stagger", label: "So le thử", count: 5, efficiencyPct: 46.2 },
  ],
};
const lines = [
  { quantity: 50, sheetsNeeded: 9, machineMinutes: 12.5, unitPrice: 111111, totalPrice: 5555550 },
  { quantity: 100, sheetsNeeded: 17, machineMinutes: 20, unitPrice: 99999, totalPrice: 9999900 },
];
const saleView: SaleQuoteView = { ok: true, perSheet: 6, efficiencyPct: 55.5, layout, lines, warnings: ["Cảnh báo bố cục thử"] };
const adminView: AdminQuoteView = {
  ...saleView,
  ok: true,
  lines: lines.map((l) => ({ ...l, cost: { materialCost: 1, machineCost: 2, laborCost: 3, consumableCost: 4, totalCost: 10, unitCost: 0.2, markupPct: 30, unitPriceRaw: 0.26 } })),
  params: {
    material: { stockWidthMm: 400, stockHeightMm: 100, stockPrice: 777777, edgeMarginMm: 10, gapMm: 3, allowRotate: true, technique: "UV" },
    machine: { cutSpeedMmPerSec: 10, engraveSpeedMm2PerSec: null, setupMinutesPerJob: 5, sheetChangeMinutes: 1, machineCostPerHour: 100, laborSecondsPerPiece: 3, laborCostPerHour: 50, consumableCostPerM2: null },
    config: { defaultGapMm: 3, lastSheetPolicy: "WHOLE_SHEET", marginTiers: [{ fromQty: 1, toQty: null, markupPct: 30 }], quantities: [50, 100], roundTo: 100, engravePct: {} },
    engraveSharePct: 0,
  },
};
const logo = { widthMm: 50, heightMm: 40, ratio: 1.25, perimeterMm: 180, areaMm2: 1500, fallbackRect: true, backgroundRemoved: false, warnings: ["Logo chưa tách nền, đang tính theo khung chữ nhật"] };

const render = (view: QuoteResponse["view"], suggestions: QuoteResponse["suggestions"] = []) =>
  renderToStaticMarkup(
    createElement(QuoteResultView, {
      data: { view, logo, suggestions, materialLabel: "M01 · Gỗ thử", configVersion: 1 },
      brandName: "Thương hiệu thử",
      logoUrl: "/api/files/logos/x/normalized.png",
      stale: false,
      onApplySuggestion: () => {},
    }),
  );

describe("QuoteResultView theo vai", () => {
  it("sale: có bảng giá, chi tiết nội bộ và cảnh báo nổi bật; KHÔNG có chi tiết giá vốn hay giá tấm", () => {
    const html = render(saleView);
    expect(html).toContain("Bảng giá theo số lượng");
    expect(html).toContain("5.555.550 đ");
    expect(html).toContain("Chi tiết nội bộ");
    expect(html).toContain("So le thử"); // các phương án đã thử nằm trong phần gập
    expect(html).toContain("Logo chưa tách nền, đang tính theo khung chữ nhật");
    expect(html).toContain("Cảnh báo bố cục thử");
    expect(html).toContain("Sao chép bảng giá gửi khách");
    expect(html).toContain("Tải SVG");
    expect(html).not.toContain("Chi tiết giá vốn");
    expect(html).not.toContain("777.777");
  });

  it("admin: thêm khối Chi tiết giá vốn (gập, không có thuộc tính open)", () => {
    const html = render(adminView);
    expect(html).toContain("Chi tiết giá vốn");
    expect(html).toContain("Giá một tấm");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("thiếu thông số: hiện hộp cảnh báo và từng mục thiếu, KHÔNG có số giá nào", () => {
    const html = render({
      ok: false,
      reason: "MISSING",
      message: "Thiếu thông số, chưa tính được giá",
      missing: [
        { code: "stockPrice", label: "Giá một tấm", scope: "material", hint: "Quản trị > Chất liệu" },
        { code: "cutSpeedMmPerSec", label: "Tốc độ cắt (mm/giây)", scope: "machine", hint: "Quản trị > Báo giá > Thông số máy" },
      ],
    });
    expect(html).toContain("Thiếu thông số, chưa tính được giá");
    expect(html).toContain("Giá một tấm");
    expect(html).toContain("Quản trị &gt; Chất liệu");
    expect(html).toContain("Tốc độ cắt (mm/giây)");
    expect(html).not.toContain("Bảng giá theo số lượng");
    expect(html).not.toContain("Chi tiết giá vốn");
    expect(html).not.toMatch(/\d\s?đ/);
    expect(html).not.toContain("Sao chép bảng giá");
  });

  it("không xếp được: hiện lời lỗi của bộ xếp hình", () => {
    const html = render({ ok: false, reason: "NESTING", error: "Logo lớn hơn tấm." });
    expect(html).toContain("Không xếp được logo lên tấm");
    expect(html).toContain("Logo lớn hơn tấm.");
    expect(html).not.toContain("Bảng giá theo số lượng");
  });

  it("gợi ý đổi kích thước: chỉ hiện gợi ý xếp được nhiều hơn kết quả đang xem", () => {
    const html = render(saleView, [
      { widthMm: 48, heightMm: 38.4, perSheet: 9, changePct: -4, gainPct: 50 },
      { widthMm: 49, heightMm: 39.2, perSheet: 6, changePct: -2, gainPct: 0 },
    ]);
    expect(html).toContain("Thử kích thước này");
    expect(html).toContain("giảm logo từ 5,0 cm xuống 4,8 cm có thể xếp 9 logo/tấm (+50%) thay vì 6");
    expect((html.match(/Thử kích thước này/g) ?? []).length).toBe(1);
  });
});
