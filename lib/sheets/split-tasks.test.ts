import { describe, expect, it } from "vitest";
import { autoSheetLayout } from "@/lib/image-options";
import { countSheetTasks, tasksForImage } from "./split";

describe("tasksForImage", () => {
  it("ảnh thường luôn một tác vụ", () => {
    expect(tasksForImage(8, false)).toBe(1);
    expect(tasksForImage(1, false)).toBe(1);
  });

  it("chất lượng cao: mỗi 4 chất liệu một tác vụ", () => {
    expect(tasksForImage(8, true)).toBe(2);
    expect(tasksForImage(5, true)).toBe(2);
    expect(tasksForImage(4, true)).toBe(1);
    expect(tasksForImage(10, true)).toBe(3);
  });

  it("không có chất liệu thì không có tác vụ", () => {
    expect(tasksForImage(0, true)).toBe(0);
    expect(tasksForImage(0, false)).toBe(0);
  });
});

describe("countSheetTasks", () => {
  it("ảnh thường: bằng số ảnh của trang", () => {
    expect(countSheetTasks(8, 2, 4, false)).toBe(1);
    expect(countSheetTasks(24, 2, 4, false)).toBe(3);
    expect(countSheetTasks(20, 2, 4, false)).toBe(3);
  });

  it("chất lượng cao: trang 8 ô có 24 chất liệu là 3 ảnh, 6 lượt", () => {
    expect(countSheetTasks(24, 2, 4, true)).toBe(6);
  });

  it("chất lượng cao với ảnh cuối không đầy: 20 chất liệu là 8 + 8 + 4, tức 2 + 2 + 1 lượt", () => {
    expect(countSheetTasks(20, 2, 4, true)).toBe(5);
  });

  it("trang trống thì 0", () => {
    expect(countSheetTasks(0, 2, 4, true)).toBe(0);
  });
});

describe("autoSheetLayout", () => {
  it("logo gần vuông hoặc đứng dùng ô cao: 4 cột x 2 hàng", () => {
    expect(autoSheetLayout(600, 600)).toMatchObject({ cols: 4, rows: 2 });
    expect(autoSheetLayout(600, 460)).toMatchObject({ cols: 4, rows: 2 });
    expect(autoSheetLayout(300, 700)).toMatchObject({ cols: 4, rows: 2 });
  });

  it("logo chữ ngang dùng ô dẹt: 2 cột x 4 hàng", () => {
    expect(autoSheetLayout(1200, 400)).toMatchObject({ cols: 2, rows: 4 });
    expect(autoSheetLayout(900, 500)).toMatchObject({ cols: 2, rows: 4 });
  });

  it("kích thước không rõ thì giữ bố cục cũ, và mọi bố cục đều đủ 8 ô", () => {
    expect(autoSheetLayout(0, 0)).toMatchObject({ cols: 2, rows: 4 });
    for (const [w, h] of [[600, 600], [1200, 400], [0, 0]]) {
      const l = autoSheetLayout(w, h);
      expect(l.cols * l.rows).toBe(8);
    }
  });
});
