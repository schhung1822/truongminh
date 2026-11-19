import { describe, expect, it } from "vitest";
import { countSheetImages, materialsPerImage, partTitle, splitIntoImages } from "./split";

describe("materialsPerImage", () => {
  it("bằng số ô của bố cục, tối đa 10", () => {
    expect(materialsPerImage(2, 4)).toBe(8);
    expect(materialsPerImage(2, 5)).toBe(10);
    expect(materialsPerImage(4, 4)).toBe(10);
    expect(materialsPerImage(1, 1)).toBe(1);
  });
});

describe("splitIntoImages / countSheetImages", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  it("80 chất liệu, bố cục 2x4 (8 ô): 10 ảnh, mỗi ảnh 8, đúng thứ tự", () => {
    const parts = splitIntoImages(items(80), 2, 4);
    expect(parts).toHaveLength(10);
    expect(parts.every((p) => p.length === 8)).toBe(true);
    expect(parts.flat()).toEqual(items(80));
    expect(countSheetImages(80, 2, 4)).toBe(10);
  });

  it("không chia hết: ảnh cuối ít hơn", () => {
    const parts = splitIntoImages(items(83), 2, 4);
    expect(parts).toHaveLength(11);
    expect(parts[10]).toEqual([81, 82, 83]);
    expect(countSheetImages(83, 2, 4)).toBe(11);
  });

  it("ít hơn một ảnh thì vẫn một ảnh; rỗng thì không có ảnh", () => {
    expect(splitIntoImages(items(6), 2, 5)).toHaveLength(1);
    expect(countSheetImages(6, 2, 5)).toBe(1);
    expect(splitIntoImages([], 2, 5)).toEqual([]);
    expect(countSheetImages(0, 2, 5)).toBe(0);
  });

  it("bố cục nhiều hơn 10 ô vẫn chỉ 10 chất liệu mỗi ảnh", () => {
    expect(countSheetImages(25, 4, 4)).toBe(3);
  });
});

describe("partTitle", () => {
  it("thêm số thứ tự khi có nhiều ảnh", () => {
    expect(partTitle("Mẫu 80", 2, 10)).toBe("Mẫu 80 (2/10)");
    expect(partTitle("Mẫu 1", 1, 1)).toBe("Mẫu 1");
  });
});
