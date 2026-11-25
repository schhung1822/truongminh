import { describe, expect, it } from "vitest";
import { getStyleRefPinIds } from "./snapshot";

describe("getStyleRefPinIds", () => {
  it("đọc mảng mới (sau D99)", () => {
    expect(getStyleRefPinIds({ design: { productType: "x", styleName: "y", note: "", pinterestPinIds: ["a", "b"] } })).toEqual(["a", "b"]);
  });

  it("đọc field cũ (số ít, ảnh tạo trước D99)", () => {
    expect(getStyleRefPinIds({ design: { productType: "x", styleName: "y", note: "", pinterestPinId: "a" } })).toEqual(["a"]);
  });

  it("không có ảnh phong cách nào thì trả mảng rỗng", () => {
    expect(getStyleRefPinIds({ design: { productType: "x", styleName: "y", note: "" } })).toEqual([]);
    expect(getStyleRefPinIds({})).toEqual([]);
  });
});
