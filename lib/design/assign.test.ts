import { describe, expect, it } from "vitest";
import { assignStyles, validateDesignRequest } from "./assign";

describe("assignStyles", () => {
  it("các phương án của cùng một chất liệu dùng kiểu khác nhau khi đủ kiểu", () => {
    const r = assignStyles(3, 2, 4);
    expect(r).toEqual([
      [0, 1],
      [2, 3],
      [0, 1],
    ]);
    for (const row of r) expect(new Set(row).size).toBe(row.length);
  });

  it("xoay vòng đều các kiểu khi nhiều ảnh hơn số kiểu", () => {
    const flat = assignStyles(4, 4, 3).flat();
    const counts = [0, 1, 2].map((s) => flat.filter((x) => x === s).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("chỉ có một kiểu thì mọi ảnh dùng kiểu đó", () => {
    expect(assignStyles(2, 3, 1)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("không có kiểu thì báo lỗi", () => {
    expect(() => assignStyles(1, 1, 0)).toThrow();
  });
});

describe("validateDesignRequest", () => {
  const ok = { materialCount: 3, variants: 2, productType: "Móc khóa" };

  it("hợp lệ", () => {
    expect(validateDesignRequest(ok)).toBeNull();
  });

  it("chặn thiếu chất liệu, thiếu loại sản phẩm, số phương án sai", () => {
    expect(validateDesignRequest({ ...ok, materialCount: 0 })).toMatch(/ít nhất một chất liệu/);
    expect(validateDesignRequest({ ...ok, productType: "  " })).toMatch(/loại sản phẩm/);
    expect(validateDesignRequest({ ...ok, variants: 0 })).toMatch(/từ 1 đến 4/);
    expect(validateDesignRequest({ ...ok, variants: 5 })).toMatch(/từ 1 đến 4/);
    expect(validateDesignRequest({ ...ok, variants: 1.5 })).toMatch(/từ 1 đến 4/);
  });

  it("chặn tạo quá nhiều ảnh một lần", () => {
    expect(validateDesignRequest({ materialCount: 10, variants: 4, productType: "x" })).toMatch(/vượt giới hạn/);
    expect(validateDesignRequest({ materialCount: 11, variants: 1, productType: "x" })).toMatch(/tối đa 10 chất liệu/);
  });
});
