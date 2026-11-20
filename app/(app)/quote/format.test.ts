import { describe, expect, it } from "vitest";
import {
  cmFieldFromMm,
  cmToMm,
  fmtCm,
  fmtDec,
  fmtInt,
  fmtPct,
  fmtVnd,
  parseDecimal,
  parseQuantityList,
  safeFileName,
  suggestionText,
  unionQuantities,
} from "./format";

describe("định dạng số", () => {
  it("tiền VND có dấu chấm ngăn nghìn", () => {
    expect(fmtInt(1234567)).toBe("1.234.567");
    expect(fmtInt(999)).toBe("999");
    expect(fmtInt(1000)).toBe("1.000");
    expect(fmtVnd(25000)).toBe("25.000 đ");
    expect(fmtInt(Number.NaN)).toBe("—");
  });

  it("hiệu suất 1 chữ số thập phân, dấu phẩy", () => {
    expect(fmtPct(78.46)).toBe("78,5%");
    expect(fmtDec(1234.56, 1)).toBe("1.234,6");
    expect(fmtDec(5, 1)).toBe("5,0");
  });

  it("cm hiển thị tối đa 1 chữ số thập phân", () => {
    expect(fmtCm(50)).toBe("5");
    expect(fmtCm(48)).toBe("4,8");
    expect(fmtCm(50, true)).toBe("5,0");
    expect(fmtCm(48.4)).toBe("4,8");
    expect(fmtCm(1200)).toBe("120");
  });
});

describe("đổi đơn vị", () => {
  it("cm sang mm và ngược lại", () => {
    expect(cmToMm(5)).toBe(50);
    expect(cmToMm(4.8)).toBe(48);
    expect(cmToMm(4.76)).toBe(47.6);
    expect(cmFieldFromMm(47.6)).toBe("4,76");
    expect(cmFieldFromMm(50)).toBe("5");
  });

  it("đọc số thập phân chấp nhận dấu phẩy và dấu chấm", () => {
    expect(parseDecimal("4,8")).toBe(4.8);
    expect(parseDecimal(" 5.25 ")).toBe(5.25);
    expect(parseDecimal("5")).toBe(5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
    expect(parseDecimal("1e3")).toBeNull();
  });
});

describe("số lượng tùy chọn", () => {
  it("đọc, bỏ trùng và sắp tăng dần", () => {
    expect(parseQuantityList("75, 10 75 1.000")).toEqual({ values: [10, 75, 1000], error: null });
    expect(parseQuantityList("")).toEqual({ values: [], error: null });
  });

  it("báo lỗi khi không phải số nguyên dương hoặc quá nhiều mốc", () => {
    expect(parseQuantityList("12 abc").error).toContain("abc");
    expect(parseQuantityList("0").error).not.toBeNull();
    expect(parseQuantityList("1.5").error).toBeNull(); // "1.5" = 15 (dấu chấm là ngăn nghìn)
    expect(parseQuantityList("1 2 3 4 5 6 7").error).toContain("Tối đa 6");
    expect(parseQuantityList("99999999").error).not.toBeNull();
  });

  it("gộp các danh sách số lượng", () => {
    expect(unionQuantities([[100, 50], [50, 75]])).toEqual([50, 75, 100]);
  });
});

describe("gợi ý và tên tệp", () => {
  it("câu gợi ý dùng số logo/tấm của kết quả đang xem", () => {
    const t = suggestionText({ widthMm: 50, perSheet: 54 }, { widthMm: 48, perSheet: 70 });
    expect(t).toBe("Nếu giảm logo từ 5,0 cm xuống 4,8 cm có thể xếp 70 logo/tấm (+30%) thay vì 54");
    expect(suggestionText({ widthMm: 50, perSheet: 10 }, { widthMm: 52, perSheet: 12 })).toContain("tăng logo từ 5,0 cm lên 5,2 cm");
  });

  it("tên tệp an toàn, bỏ dấu", () => {
    expect(safeFileName("Báo giá: Đồng Phục / Logo 5x5", "svg")).toBe("bao-gia-dong-phuc-logo-5x5.svg");
    expect(safeFileName("///", "svg")).toBe("bao-gia.svg");
  });
});
