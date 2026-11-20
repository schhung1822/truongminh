import { describe, expect, it } from "vitest";
import { cmToMm, formatVnd, groupDigits, mmToCm, numToText, round4, withUnit } from "./format";
import { parseCmToMm, parseGrouped, parsePlain } from "./parse";

describe("đổi cm ↔ mm", () => {
  it("đổi đúng và không sinh sai số", () => {
    expect(cmToMm(59.5)).toBe(595);
    expect(cmToMm(60)).toBe(600);
    expect(cmToMm(0.1 + 0.2)).toBe(3);
    expect(cmToMm(1.1)).toBe(11);
    expect(mmToCm(595)).toBe(59.5);
    expect(mmToCm(599.9999999)).toBe(60);
    expect(mmToCm(600.0000000001)).toBe(60);
    expect(mmToCm(cmToMm(1.1))).toBe(1.1);
  });
  it("làm tròn tối đa 4 chữ số thập phân", () => {
    expect(round4(59.99999)).toBe(60);
    expect(cmToMm(59.9999)).toBe(599.999);
    expect(cmToMm(12.345678)).toBe(123.4568);
  });
});

describe("numToText và groupDigits", () => {
  it("số → chữ để điền vào ô (dấu phẩy thập phân)", () => {
    expect(numToText(null)).toBe("");
    expect(numToText(undefined)).toBe("");
    expect(numToText(Number.NaN)).toBe("");
    expect(numToText(0)).toBe("0");
    expect(numToText(-0)).toBe("0");
    expect(numToText(60)).toBe("60");
    expect(numToText(100)).toBe("100");
    expect(numToText(1.5)).toBe("1,5");
    expect(numToText(0.1 + 0.2)).toBe("0,3");
    expect(numToText(1234567.891)).toBe("1234567,891");
    expect(numToText(0.0000001)).toBe("0,0000001");
  });
  it("hiển thị có dấu chấm ngăn nghìn", () => {
    expect(groupDigits(1500000)).toBe("1.500.000");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1.000");
    expect(groupDigits(1234.5)).toBe("1.234,5");
    expect(groupDigits(-1234567)).toBe("-1.234.567");
    expect(groupDigits(0.5)).toBe("0,5");
    expect(groupDigits(1234.56789, 2)).toBe("1.234,57");
    expect(groupDigits(null)).toBe("");
  });
  it("tiền đồng và đơn vị, trống là Chưa có dữ liệu", () => {
    expect(formatVnd(120000)).toBe("120.000 đ");
    expect(formatVnd(null)).toBe("Chưa có dữ liệu");
    expect(withUnit(20, "mm/giây")).toBe("20 mm/giây");
    expect(withUnit(null, "mm/giây")).toBe("Chưa có dữ liệu");
  });
});

describe("parsePlain (số thường)", () => {
  it("trống là null, dấu phẩy hoặc chấm thập phân đều được", () => {
    expect(parsePlain("")).toBeNull();
    expect(parsePlain("   ")).toBeNull();
    expect(parsePlain(null)).toBeNull();
    expect(parsePlain("12,5")).toBe(12.5);
    expect(parsePlain("12.5")).toBe(12.5);
    expect(parsePlain(".5")).toBe(0.5);
    expect(parsePlain("-3")).toBe(-3);
    expect(parsePlain(" 7 ")).toBe(7);
  });
  it("từ chối chữ lạ, số mũ, hai dấu", () => {
    expect(parsePlain("abc")).toBe("invalid");
    expect(parsePlain("1e5")).toBe("invalid");
    expect(parsePlain("0x10")).toBe("invalid");
    expect(parsePlain("12abc")).toBe("invalid");
    expect(parsePlain("1,5,2")).toBe("invalid");
    expect(parsePlain("1.500,5")).toBe("invalid");
  });
});

describe("parseGrouped (tiền và số lớn)", () => {
  it("dấu chấm kiểu 1.500.000 là dấu ngăn nghìn", () => {
    expect(parseGrouped("1.500.000")).toBe(1500000);
    expect(parseGrouped("1.500.000đ")).toBe(1500000);
    expect(parseGrouped("120.000 đ")).toBe(120000);
    expect(parseGrouped("1.500")).toBe(1500);
    expect(parseGrouped("120000")).toBe(120000);
    expect(parseGrouped("1.234,5")).toBe(1234.5);
  });
  it("số thập phân thường vẫn đúng", () => {
    expect(parseGrouped("1,5")).toBe(1.5);
    expect(parseGrouped("1.5")).toBe(1.5);
    expect(parseGrouped("0.500")).toBe(0.5);
    expect(parseGrouped("1.5000")).toBe(1.5);
  });
  it("trống và sai", () => {
    expect(parseGrouped("")).toBeNull();
    expect(parseGrouped("abc")).toBe("invalid");
    expect(parseGrouped("1,2,3")).toBe("invalid");
    expect(parseGrouped("12.34.5")).toBe("invalid");
  });
});

describe("parseCmToMm", () => {
  it("cm gõ vào → mm để lưu", () => {
    expect(parseCmToMm("59,5")).toBe(595);
    expect(parseCmToMm("60")).toBe(600);
    expect(parseCmToMm("0,1")).toBe(1);
    expect(parseCmToMm("1,23456")).toBe(12.3456);
    expect(parseCmToMm("")).toBeNull();
    expect(parseCmToMm("x")).toBe("invalid");
  });
});
