import { describe, expect, it } from "vitest";
import { cellRegions, HEADER_RATIO } from "./geometry";

describe("cellRegions", () => {
  it("2 cột x 4 hàng, khung 16:9: 8 ô nằm dưới đầu trang và phủ kín vùng ảnh AI", () => {
    const W = 1600;
    const aiH = 900; // 16:9
    const headerH = Math.round(W * HEADER_RATIO);
    const FH = headerH + aiH + 64; // thêm chân trang
    const r = cellRegions({ finalWidth: W, finalHeight: FH, aspectRatio: "16:9", cols: 2, rows: 4, count: 8 });
    expect(r).toHaveLength(8);
    expect(r[0].left).toBe(0);
    expect(r[0].top).toBeCloseTo(headerH / FH, 5);
    expect(r[1].left).toBeCloseTo(0.5, 5);
    expect(r[7].left + r[7].width).toBeCloseTo(1, 5);
    expect(r[7].top + r[7].height).toBeCloseTo((headerH + aiH) / FH, 3);
  });

  it("ít chất liệu hơn số ô thì chỉ có bấy nhiêu vùng", () => {
    const r = cellRegions({ finalWidth: 1000, finalHeight: 1500, aspectRatio: "2:3", cols: 2, rows: 5, count: 3 });
    expect(r.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  it("tỉ lệ khung lạ hoặc kích thước hỏng thì không vỡ", () => {
    expect(cellRegions({ finalWidth: 1000, finalHeight: 1000, aspectRatio: "x", cols: 1, rows: 1, count: 1 })).toHaveLength(1);
    expect(cellRegions({ finalWidth: 0, finalHeight: 0, aspectRatio: "1:1", cols: 1, rows: 1, count: 1 })).toEqual([]);
  });
});
