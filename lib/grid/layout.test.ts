import { describe, expect, it } from "vitest";
import { badgeRect, computeCells, computeLegend, labelStrip } from "./layout";

describe("computeCells", () => {
  it("chia 2 cột x 5 hàng đúng vị trí và thứ tự đọc", () => {
    const cells = computeCells({ width: 1000, height: 1500, cols: 2, rows: 5, count: 10 });
    expect(cells).toHaveLength(10);
    expect(cells[0]).toMatchObject({ index: 0, col: 0, row: 0, x: 0, y: 0, w: 500, h: 300 });
    expect(cells[1]).toMatchObject({ index: 1, col: 1, row: 0, x: 500, y: 0, w: 500, h: 300 });
    expect(cells[2]).toMatchObject({ col: 0, row: 1, x: 0, y: 300 });
    expect(cells[9]).toMatchObject({ col: 1, row: 4, x: 500, y: 1200 });
  });

  it("các ô lấp kín ảnh, không hở không chồng, kể cả khi chia lẻ", () => {
    const width = 1365;
    const height = 2048;
    const cells = computeCells({ width, height, cols: 3, rows: 4, count: 12 });
    const area = cells.reduce((s, c) => s + c.w * c.h, 0);
    expect(area).toBe(width * height);
    // ô cuối chạm đúng mép phải và mép dưới
    const last = cells[11];
    expect(last.x + last.w).toBe(width);
    expect(last.y + last.h).toBe(height);
    // ô kề nhau khít nhau
    expect(cells[0].x + cells[0].w).toBe(cells[1].x);
    expect(cells[0].y + cells[0].h).toBe(cells[3].y);
  });

  it("trang chưa đầy chỉ trả về các ô đầu tiên", () => {
    const cells = computeCells({ width: 1000, height: 1500, cols: 2, rows: 5, count: 7 });
    expect(cells).toHaveLength(7);
    expect(cells[6]).toMatchObject({ col: 0, row: 3 });
  });

  it("báo lỗi khi số ô vượt quá lưới hoặc lưới không hợp lệ", () => {
    expect(() => computeCells({ width: 100, height: 100, cols: 2, rows: 2, count: 5 })).toThrow();
    expect(() => computeCells({ width: 100, height: 100, cols: 0, rows: 2, count: 0 })).toThrow();
  });
});

describe("labelStrip", () => {
  it("nằm sát đáy ô, cùng chiều rộng, cao theo tỉ lệ", () => {
    const strip = labelStrip({ x: 500, y: 300, w: 500, h: 300 }, { heightRatio: 0.1 });
    expect(strip).toEqual({ x: 500, y: 570, w: 500, h: 30 });
  });

  it("không thấp hơn chiều cao tối thiểu và không cao hơn ô", () => {
    expect(labelStrip({ x: 0, y: 0, w: 100, h: 50 }, { heightRatio: 0.01, minHeight: 14 }).h).toBe(14);
    expect(labelStrip({ x: 0, y: 0, w: 100, h: 10 }, { minHeight: 14 }).h).toBe(10);
  });
});

describe("badgeRect", () => {
  it("nằm góc trên trái, vuông, không lớn hơn ô", () => {
    expect(badgeRect({ x: 500, y: 300, w: 500, h: 300 }, 40, 8)).toEqual({ x: 508, y: 308, w: 40, h: 40 });
    expect(badgeRect({ x: 0, y: 0, w: 30, h: 30 }, 40).w).toBe(30);
  });
});

describe("computeLegend", () => {
  it("xếp 10 mục thành 2 cột, đọc trái sang phải rồi mới xuống dòng, khớp đúng thứ tự ô trên ảnh", () => {
    const l = computeLegend({ width: 1000, count: 10, columns: 2, rowHeight: 40, padding: 20 });
    expect(l.height).toBe(20 * 2 + 5 * 40);
    expect(l.entries[0]).toMatchObject({ index: 0, x: 20, y: 20, w: 480, h: 40 });
    expect(l.entries[1]).toMatchObject({ index: 1, x: 500, y: 20 });
    expect(l.entries[4]).toMatchObject({ index: 4, x: 20, y: 100 });
    expect(l.entries[5]).toMatchObject({ index: 5, x: 500, y: 100 });
  });

  it("8 mục 2 cột: mục 7 và 8 (hàng cuối) nằm cùng hàng, đúng cột trái/phải như ô 7 và 8 trên ảnh", () => {
    const l = computeLegend({ width: 1000, count: 8, columns: 2, rowHeight: 40, padding: 20 });
    expect(l.entries[6]).toMatchObject({ index: 6, x: 20, y: 20 + 3 * 40 });
    expect(l.entries[7]).toMatchObject({ index: 7, x: 500, y: 20 + 3 * 40 });
  });

  it("số mục lẻ vẫn đủ dòng, không có mục thì cao bằng 0", () => {
    expect(computeLegend({ width: 1000, count: 7, columns: 2, rowHeight: 40, padding: 10 }).height).toBe(20 + 4 * 40);
    expect(computeLegend({ width: 1000, count: 0, columns: 2, rowHeight: 40, padding: 10 }).height).toBe(0);
  });
});
