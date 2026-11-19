import { describe, expect, it } from "vitest";
import { isLabelPos, isLabelStyle, labelCardOrigin, styleHasPosition } from "./label-pos";

const cell = { x: 100, y: 200, w: 400, h: 300 };
const card = { w: 120, h: 40 };

describe("labelCardOrigin", () => {
  it("dưới phải: sát góc dưới phải, cách mép một khoảng lề", () => {
    expect(labelCardOrigin("br", cell, card, 10)).toEqual({ x: 100 + 400 - 120 - 10, y: 200 + 300 - 40 - 10 });
  });
  it("trên trái: sát góc trên trái", () => {
    expect(labelCardOrigin("tl", cell, card, 10)).toEqual({ x: 110, y: 210 });
  });
  it("giữa: căn giữa theo chiều ngang", () => {
    expect(labelCardOrigin("tc", cell, card, 10)).toEqual({ x: 100 + 140, y: 210 });
    expect(labelCardOrigin("bc", cell, card, 10)).toEqual({ x: 240, y: 450 });
  });
  it("trên phải và dưới trái", () => {
    expect(labelCardOrigin("tr", cell, card, 10)).toEqual({ x: 370, y: 210 });
    expect(labelCardOrigin("bl", cell, card, 10)).toEqual({ x: 110, y: 450 });
  });
});

describe("isLabelPos / isLabelStyle", () => {
  it("chỉ nhận các vị trí hợp lệ", () => {
    expect(isLabelPos("tc")).toBe(true);
    expect(isLabelPos("none")).toBe(false);
    expect(isLabelPos("mc")).toBe(false);
    expect(isLabelPos(undefined)).toBe(false);
  });
  it("chỉ nhận các kiểu nhãn hợp lệ; chỉ kiểu có thẻ mới có vị trí", () => {
    expect(isLabelStyle("compact")).toBe(true);
    expect(isLabelStyle("none")).toBe(true);
    expect(isLabelStyle("card")).toBe(false);
    expect(styleHasPosition("overlay")).toBe(true);
    expect(styleHasPosition("compact")).toBe(true);
    expect(styleHasPosition("legend")).toBe(false);
    expect(styleHasPosition("none")).toBe(false);
  });
});
