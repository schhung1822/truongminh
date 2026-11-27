import { describe, expect, it } from "vitest";
import { extractJson, resolvePicks, stripTag, type CatalogImageCells } from "./parse";

describe("stripTag", () => {
  it("chưa đặt tên bot thì mọi tin là lệnh", () => {
    expect(stripTag("  làm catalog đi ", "")).toEqual({ mentioned: true, text: "làm catalog đi" });
  });
  it("nhận ra và bỏ @tên bot, không phân biệt hoa thường và dấu", () => {
    expect(stripTag("@Trợ Lý Xưởng làm catalog đi", "Trợ lý xưởng")).toEqual({ mentioned: true, text: "làm catalog đi" });
    expect(stripTag("làm catalog @tro ly xuong", "Trợ lý xưởng").mentioned).toBe(true);
  });
  it("không nhắc tên bot thì không phải lệnh", () => {
    expect(stripTag("mai khách tới lấy hàng", "Trợ lý xưởng")).toEqual({ mentioned: false, text: "mai khách tới lấy hàng" });
  });
  it("tên bot có ký tự đặc biệt không làm hỏng regex", () => {
    expect(stripTag("@Bot (xưởng) làm đi", "Bot (xưởng)")).toEqual({ mentioned: true, text: "làm đi" });
  });
});

describe("extractJson", () => {
  it("lấy JSON trong khối code và có chữ thừa", () => {
    expect(extractJson('Đây:\n```json\n{"a":{"b":"}"}}\n``` hết')).toEqual({ a: { b: "}" } });
  });
  it("không có JSON thì null", () => {
    expect(extractJson("không có gì")).toBeNull();
    expect(extractJson('{"a":')).toBeNull();
  });
});

const cells = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ materialId: `${prefix}${i + 1}`, code: `${prefix.toUpperCase()}-${i + 1}`, name: `Mẫu ${prefix}${i + 1}` }));
const IMAGES: CatalogImageCells[] = [
  { imageNumber: 1, cells: cells(4, "a") },
  { imageNumber: 2, cells: cells(4, "b") },
];

describe("resolvePicks", () => {
  it("đổi ảnh + số ô thành chất liệu", () => {
    const r = resolvePicks(IMAGES, [{ image: 2, cells: [1, 3] }, { image: 1, cells: [4] }], []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.materials.map((m) => m.materialId)).toEqual(["b1", "b3", "a4"]);
  });
  it("không nói ảnh nào: một ảnh thì dùng luôn, nhiều ảnh thì hỏi lại", () => {
    expect(resolvePicks([IMAGES[0]], [{ image: null, cells: [2] }], []).ok).toBe(true);
    expect(resolvePicks(IMAGES, [{ image: null, cells: [2] }], []).ok).toBe(false);
  });
  it("báo lỗi khi ảnh hoặc ô không tồn tại", () => {
    expect(resolvePicks(IMAGES, [{ image: 9, cells: [1] }], []).ok).toBe(false);
    expect(resolvePicks(IMAGES, [{ image: 1, cells: [5] }], []).ok).toBe(false);
    expect(resolvePicks(IMAGES, [{ image: 1, cells: [0] }], []).ok).toBe(false);
  });
  it("nhận mã chất liệu, bỏ trùng", () => {
    const r = resolvePicks(IMAGES, [{ image: 1, cells: [1] }], ["a-1", "B-2"]);
    expect(r.ok && r.materials.map((m) => m.materialId)).toEqual(["a1", "b2"]);
    expect(resolvePicks(IMAGES, [], ["zzz"]).ok).toBe(false);
  });
  it("chưa chọn gì hoặc chọn quá 10", () => {
    expect(resolvePicks(IMAGES, [], []).ok).toBe(false);
    const big: CatalogImageCells[] = [{ imageNumber: 1, cells: cells(12, "c") }];
    expect(resolvePicks(big, [{ image: 1, cells: Array.from({ length: 11 }, (_, i) => i + 1) }], []).ok).toBe(false);
  });
});
