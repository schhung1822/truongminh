import { describe, expect, it } from "vitest";
import { decimalToNumber, describeStock, formatDong, mmToCmText, roundPrice, stockToForm } from "./stock";
import { cmToMm } from "./stock-input";

describe("đổi đơn vị cm <-> mm", () => {
  it("cm nhập vào -> mm lưu, làm tròn tối đa 4 chữ số thập phân", () => {
    expect(cmToMm("60")).toBe(600);
    expect(cmToMm("59,9")).toBe(599);
    expect(cmToMm("59.9")).toBe(599); // không bị lệch kiểu 599.0000000000001
    expect(cmToMm("1.23456")).toBe(12.3456);
    expect(cmToMm(40)).toBe(400);
  });

  it("để trống là chưa có dữ liệu (null), không phải 0; chữ không phải số thì invalid", () => {
    expect(cmToMm("")).toBeNull();
    expect(cmToMm("   ")).toBeNull();
    expect(cmToMm(null)).toBeNull();
    expect(cmToMm("abc")).toBe("invalid");
    expect(cmToMm("1.500,5")).toBe("invalid"); // mơ hồ dấu ngăn nghìn
  });

  it("mm lưu -> cm hiển thị trong ô nhập", () => {
    expect(mmToCmText(600)).toBe("60");
    expect(mmToCmText(599)).toBe("59.9");
    expect(mmToCmText(297.5)).toBe("29.75");
    expect(mmToCmText(null)).toBe("");
    expect(mmToCmText(undefined)).toBe("");
  });

  it("đi một vòng cm -> mm -> cm không đổi", () => {
    for (const cm of ["60", "59.9", "29.75", "0.5", "120.1234"]) expect(mmToCmText(cmToMm(cm) as number)).toBe(cm);
  });
});

describe("tình trạng thông số tấm", () => {
  const full = { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5 };

  it("đủ khi có rộng, cao, giá tấm, lề; có kích thước dạng '60 x 40 cm'", () => {
    expect(describeStock(full)).toEqual({ complete: true, missing: [], sizeText: "60 x 40 cm" });
  });

  it("lề bằng 0 là có dữ liệu (không phải thiếu)", () => {
    expect(describeStock({ ...full, edgeMarginMm: 0 }).complete).toBe(true);
  });

  it("thiếu một trong bốn thì báo thiếu và nêu đúng cái thiếu", () => {
    expect(describeStock({ ...full, stockPrice: null })).toMatchObject({ complete: false, missing: ["giá tấm"], sizeText: "60 x 40 cm" });
    expect(describeStock({ ...full, edgeMarginMm: null }).missing).toEqual(["lề tấm"]);
    expect(describeStock({ stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null })).toEqual({
      complete: false,
      missing: ["rộng tấm", "cao tấm", "giá tấm", "lề tấm"],
      sizeText: null,
    });
  });

  it("chỉ có một cạnh thì chưa có kích thước", () => {
    expect(describeStock({ ...full, stockHeightMm: null }).sizeText).toBeNull();
  });
});

describe("điền form và hiển thị tiền", () => {
  it("stockToForm: trống thì ô trống, kích thước tấm đổi sang cm, giá không có dấu ngăn nghìn", () => {
    expect(stockToForm({ stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5, gapMm: 3, allowRotate: false })).toEqual({
      widthCm: "60",
      heightCm: "40",
      price: "1500000",
      edgeMarginMm: "5",
      gapMm: "3",
      allowRotate: false,
    });
    expect(stockToForm({ stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null, gapMm: null, allowRotate: true })).toEqual({
      widthCm: "",
      heightCm: "",
      price: "",
      edgeMarginMm: "",
      gapMm: "",
      allowRotate: true,
    });
  });

  it("decimalToNumber đọc được Decimal dạng chữ; roundPrice về 2 chữ số", () => {
    expect(decimalToNumber({ toString: () => "1500000.5" })).toBe(1500000.5);
    expect(decimalToNumber(null)).toBeNull();
    expect(roundPrice(1500000.456)).toBe(1500000.46);
  });

  it("formatDong ngăn nghìn bằng dấu chấm, phần lẻ bằng dấu phẩy", () => {
    expect(formatDong(1500000)).toBe("1.500.000");
    expect(formatDong(999)).toBe("999");
    expect(formatDong(1234.5)).toBe("1.234,5");
  });
});
