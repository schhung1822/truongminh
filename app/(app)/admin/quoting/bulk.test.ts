import { describe, expect, it } from "vitest";
import { MAX_BULK_ROWS, parsePriceSpec, parseStockPatch, previewPriceChange, previewStockPatch } from "./bulk";

const row = (id: string, stockPrice: number | null) => ({ id, code: id.toUpperCase(), name: `Tên ${id}`, stockPrice });

describe("parsePriceSpec", () => {
  it("đặt giá tuyệt đối", () => {
    expect(parsePriceSpec({ mode: "set", value: "120.000", roundTo: "" })).toEqual({ ok: true, spec: { mode: "set", value: 120000 } });
  });
  it("từ chối giá trống, bằng 0 hoặc sai", () => {
    expect("error" in parsePriceSpec({ mode: "set", value: "", roundTo: "" })).toBe(true);
    expect("error" in parsePriceSpec({ mode: "set", value: "0", roundTo: "" })).toBe(true);
    expect("error" in parsePriceSpec({ mode: "set", value: "abc", roundTo: "" })).toBe(true);
  });
  it("tăng giảm theo %", () => {
    expect(parsePriceSpec({ mode: "percent", value: "5", roundTo: "" })).toEqual({ ok: true, spec: { mode: "percent", value: 5, roundTo: 1 } });
    expect(parsePriceSpec({ mode: "percent", value: "-3,5", roundTo: "1.000" })).toEqual({ ok: true, spec: { mode: "percent", value: -3.5, roundTo: 1000 } });
  });
  it("chặn % vô lý và làm tròn sai", () => {
    expect("error" in parsePriceSpec({ mode: "percent", value: "-100", roundTo: "" })).toBe(true);
    expect("error" in parsePriceSpec({ mode: "percent", value: "1001", roundTo: "" })).toBe(true);
    expect("error" in parsePriceSpec({ mode: "percent", value: "", roundTo: "" })).toBe(true);
    expect("error" in parsePriceSpec({ mode: "percent", value: "5", roundTo: "1,5" })).toBe(true);
    expect("error" in parsePriceSpec({ mode: "percent", value: "5", roundTo: "0" })).toBe(true);
  });
  it("từ chối cách đổi lạ (dữ liệu từ trình duyệt)", () => {
    expect("error" in parsePriceSpec({ mode: "hack" as never, value: "5", roundTo: "" })).toBe(true);
  });
});

describe("previewPriceChange", () => {
  it("tăng 5% và bỏ qua dòng chưa có giá cũ", () => {
    const out = previewPriceChange([row("a", 100000), row("b", null), row("c", 120000)], { mode: "percent", value: 5, roundTo: 1 });
    expect(out.map((o) => o.status)).toEqual(["change", "skip", "change"]);
    expect(out.map((o) => o.newPrice)).toEqual([105000, null, 126000]);
    expect(out[1].reason).toMatch(/Chưa có giá cũ/);
  });
  it("không sinh số lẻ kiểu 1050000.0000000001", () => {
    expect(previewPriceChange([row("a", 1000000)], { mode: "percent", value: 5, roundTo: 1 })[0].newPrice).toBe(1050000);
  });
  it("giảm theo % và làm tròn tới bội số", () => {
    expect(previewPriceChange([row("a", 100000)], { mode: "percent", value: -3, roundTo: 1 })[0].newPrice).toBe(97000);
    expect(previewPriceChange([row("a", 123456)], { mode: "percent", value: 5, roundTo: 1000 })[0].newPrice).toBe(130000);
  });
  it("0% hoặc giá mới trùng giá cũ là không đổi", () => {
    expect(previewPriceChange([row("a", 100000)], { mode: "percent", value: 0, roundTo: 1 })[0].status).toBe("same");
    expect(previewPriceChange([row("a", 100000)], { mode: "set", value: 100000 })[0].status).toBe("same");
  });
  it("đặt tuyệt đối áp cho cả dòng chưa có giá", () => {
    const out = previewPriceChange([row("a", 90000), row("b", null)], { mode: "set", value: 120000 });
    expect(out.map((o) => o.status)).toEqual(["change", "change"]);
    expect(out.map((o) => o.newPrice)).toEqual([120000, 120000]);
    expect(out[1].oldPrice).toBeNull();
  });
  it("giá mới không dương là lỗi, không được lưu", () => {
    const out = previewPriceChange([row("a", 1)], { mode: "percent", value: -99.99999, roundTo: 1 });
    expect(out[0].status).toBe("error");
    expect(out[0].newPrice).toBeNull();
  });
});

describe("parseStockPatch", () => {
  const blank = { widthCm: "", heightCm: "", edgeMarginMm: "", gapMm: "", clearGap: false };
  it("không nhập gì thì báo lỗi, không áp dụng ngầm", () => {
    expect("error" in parseStockPatch(blank)).toBe(true);
  });
  it("đổi cm sang mm, ô trống giữ nguyên", () => {
    const r = parseStockPatch({ ...blank, widthCm: "60", heightCm: "40,5", edgeMarginMm: "5" });
    expect(r).toEqual({ ok: true, patch: { widthMm: 600, heightMm: 405, edgeMarginMm: 5 } });
  });
  it("xóa khoảng cách riêng = null; vừa nhập vừa xóa là lỗi", () => {
    expect(parseStockPatch({ ...blank, clearGap: true })).toEqual({ ok: true, patch: { gapMm: null } });
    expect("error" in parseStockPatch({ ...blank, gapMm: "3", clearGap: true })).toBe(true);
  });
  it("chặn số sai và vượt giới hạn", () => {
    expect("error" in parseStockPatch({ ...blank, widthCm: "abc" })).toBe(true);
    expect("error" in parseStockPatch({ ...blank, widthCm: "0" })).toBe(true);
    expect("error" in parseStockPatch({ ...blank, widthCm: "20000" })).toBe(true);
    expect("error" in parseStockPatch({ ...blank, edgeMarginMm: "-1" })).toBe(true);
    expect("error" in parseStockPatch({ ...blank, gapMm: "-1" })).toBe(true);
  });
});

describe("previewStockPatch", () => {
  const r = { id: "a", code: "A", name: "A", stockWidthMm: 600, stockHeightMm: 400, edgeMarginMm: 5, gapMm: 3 };
  it("chỉ báo các trường thật sự đổi", () => {
    const p = previewStockPatch([r], { widthMm: 600, heightMm: 500, gapMm: null })[0];
    expect(p.changed).toEqual(["stockHeightMm", "gapMm"]);
    expect(p.after).toEqual({ stockWidthMm: 600, stockHeightMm: 500, edgeMarginMm: 5, gapMm: null });
    expect(p.before.gapMm).toBe(3);
  });
  it("dòng chưa có dữ liệu cũng nhận giá trị mới", () => {
    const p = previewStockPatch([{ ...r, stockWidthMm: null, gapMm: null }], { widthMm: 600, gapMm: 2 })[0];
    expect(p.changed).toEqual(["stockWidthMm", "gapMm"]);
  });
});

it("giới hạn 500 dòng mỗi lần", () => {
  expect(MAX_BULK_ROWS).toBe(500);
});
