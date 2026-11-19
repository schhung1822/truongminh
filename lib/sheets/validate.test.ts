import { describe, expect, it } from "vitest";
import { validateSheetComposition } from "./validate";

describe("validateSheetComposition", () => {
  it("chấp nhận trang đầy đủ 2x5 với 10 chất liệu", () => {
    expect(validateSheetComposition({ cols: 2, rows: 5, materialCount: 10 })).toBeNull();
  });

  it("chấp nhận trang chưa đầy", () => {
    expect(validateSheetComposition({ cols: 2, rows: 5, materialCount: 6 })).toBeNull();
    expect(validateSheetComposition({ cols: 2, rows: 5, materialCount: 0 })).toBeNull();
  });

  it("chấp nhận trang nhiều chất liệu hơn số ô (sẽ tự chia thành nhiều ảnh)", () => {
    expect(validateSheetComposition({ cols: 2, rows: 4, materialCount: 80 })).toBeNull();
    expect(validateSheetComposition({ cols: 2, rows: 2, materialCount: 5 })).toBeNull();
  });

  it("chặn quá số chất liệu tối đa của một trang", () => {
    expect(validateSheetComposition({ cols: 2, rows: 4, materialCount: 201 })).toMatch(/tối đa 200/);
  });

  it("chặn số cột/hàng không hợp lệ", () => {
    expect(validateSheetComposition({ cols: 0, rows: 5, materialCount: 1 })).toMatch(/cột/);
    expect(validateSheetComposition({ cols: 2, rows: 11, materialCount: 1 })).toMatch(/hàng/);
    expect(validateSheetComposition({ cols: 2.5, rows: 5, materialCount: 1 })).toMatch(/cột/);
  });
});
