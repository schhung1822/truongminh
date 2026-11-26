import { describe, expect, it } from "vitest";
import { combinedPrompt, planTiles, readTiles, stitchedAspect, stitchedGrid, taskCount, tileUsedRows } from "./tiles";

describe("planTiles", () => {
  it("8 chất liệu thành 2 mảnh 4 ô", () => {
    expect(planTiles(8)).toEqual([
      { from: 0, count: 4 },
      { from: 4, count: 4 },
    ]);
  });

  it("10 chất liệu thành 4 + 4 + 2, 3 chất liệu là một mảnh", () => {
    expect(planTiles(10).map((t) => t.count)).toEqual([4, 4, 2]);
    expect(planTiles(3)).toEqual([{ from: 0, count: 3 }]);
    expect(planTiles(0)).toEqual([]);
  });
});

describe("lưới và tỉ lệ sau khi ghép", () => {
  it("luôn 2 cột, số hàng theo số chất liệu", () => {
    expect(stitchedGrid(8)).toEqual({ cols: 2, rows: 4 });
    expect(stitchedGrid(5)).toEqual({ cols: 2, rows: 3 });
    expect(stitchedGrid(1)).toEqual({ cols: 2, rows: 1 });
  });

  it("tỉ lệ khung rút gọn, mỗi ô vuông", () => {
    expect(stitchedAspect(8)).toBe("1:2");
    expect(stitchedAspect(4)).toBe("1:1");
    expect(stitchedAspect(6)).toBe("2:3");
    expect(stitchedAspect(10)).toBe("2:5");
    expect(stitchedAspect(2)).toBe("2:1");
  });

  it("mảnh 1-2 ô chỉ dùng hàng trên, 3-4 ô dùng cả hai hàng", () => {
    expect(tileUsedRows(1)).toBe(1);
    expect(tileUsedRows(2)).toBe(1);
    expect(tileUsedRows(3)).toBe(2);
    expect(tileUsedRows(4)).toBe(2);
  });
});

describe("readTiles và taskCount", () => {
  it("ảnh thường (không có mảnh) tính 1 lượt", () => {
    expect(readTiles(null)).toBeNull();
    expect(readTiles([])).toBeNull();
    expect(taskCount(null)).toBe(1);
    expect(taskCount(undefined)).toBe(1);
  });

  it("ảnh chất lượng cao tính theo số mảnh và giữ trạng thái từng mảnh", () => {
    const raw = [
      { from: 0, count: 4, prompt: "p1", taskId: "t1", path: "mockups/a.webp", credits: 10 },
      { from: 4, count: 4, prompt: "p2" },
    ];
    expect(taskCount(raw)).toBe(2);
    expect(readTiles(raw)).toEqual([
      { from: 0, count: 4, prompt: "p1", taskId: "t1", path: "mockups/a.webp", credits: 10 },
      { from: 4, count: 4, prompt: "p2", taskId: null, path: null, credits: null },
    ]);
  });

  it("dữ liệu sai dạng thì coi như ảnh thường", () => {
    expect(readTiles([{ from: 0 }])).toBeNull();
    expect(readTiles("abc")).toBeNull();
    expect(taskCount([{ prompt: "x" }])).toBe(1);
  });
});

describe("combinedPrompt", () => {
  it("ghi rõ từng mảnh ứng với ô nào", () => {
    const text = combinedPrompt([
      { from: 0, count: 4, prompt: "AAA" },
      { from: 4, count: 2, prompt: "BBB" },
    ]);
    expect(text).toContain("[Mảnh 1/2: ô 1 đến 4]\nAAA");
    expect(text).toContain("[Mảnh 2/2: ô 5 đến 6]\nBBB");
  });
});
