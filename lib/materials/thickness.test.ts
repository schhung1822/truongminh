import { describe, expect, it } from "vitest";
import { formatThickness, parseThickness, thicknessClass } from "./thickness";

describe("thicknessClass", () => {
  it("chia Mỏng / Cao thành / Dày theo quy ước của xưởng", () => {
    expect(thicknessClass(0.2)?.key).toBe("thin");
    expect(thicknessClass(0.4)?.key).toBe("thin");
    expect(thicknessClass(0.5)?.key).toBe("mid");
    expect(thicknessClass(0.9)?.key).toBe("mid");
    expect(thicknessClass(1.0)?.key).toBe("thick");
    expect(thicknessClass(1.3)?.key).toBe("thick");
  });

  it("số đo nằm giữa hai khoảng thì xếp vào nhóm gần nhất", () => {
    expect(thicknessClass(0.44)?.key).toBe("thin");
    expect(thicknessClass(0.47)?.key).toBe("mid");
    expect(thicknessClass(0.94)?.key).toBe("mid");
    expect(thicknessClass(0.96)?.key).toBe("thick");
  });

  it("không có số đo thì null", () => {
    expect(thicknessClass(null)).toBeNull();
    expect(thicknessClass(undefined)).toBeNull();
    expect(thicknessClass(0)).toBeNull();
    expect(thicknessClass(Number.NaN)).toBeNull();
  });
});

describe("parseThickness", () => {
  it("chấp nhận dấu phẩy, đuôi mm và khoảng trắng", () => {
    expect(parseThickness("0.51")).toBe(0.51);
    expect(parseThickness("0,51")).toBe(0.51);
    expect(parseThickness(" 0,5 mm ")).toBe(0.5);
    expect(parseThickness("1MM")).toBe(1);
  });

  it("trống thì null, sai thì undefined", () => {
    expect(parseThickness("")).toBeNull();
    expect(parseThickness(null)).toBeNull();
    expect(parseThickness("abc")).toBeUndefined();
    expect(parseThickness("-1")).toBeUndefined();
    expect(parseThickness("0")).toBeUndefined();
    expect(parseThickness("50")).toBeUndefined();
  });

  it("làm tròn 2 chữ số thập phân", () => {
    expect(parseThickness("0.514")).toBe(0.51);
  });
});

describe("formatThickness", () => {
  it("bỏ số 0 thừa", () => {
    expect(formatThickness(0.5)).toBe("0.5 mm");
    expect(formatThickness(1)).toBe("1 mm");
    expect(formatThickness(0.51)).toBe("0.51 mm");
    expect(formatThickness(null)).toBe("");
  });
});
