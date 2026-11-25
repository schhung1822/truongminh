import { describe, expect, it } from "vitest";
import { clampRect, fullRect, moveRect, resizeRect, rotatedSize } from "./crop-math";

describe("rotatedSize", () => {
  it("0 và 180 độ giữ nguyên rộng/cao", () => {
    expect(rotatedSize({ w: 800, h: 600 }, 0)).toEqual({ w: 800, h: 600 });
    expect(rotatedSize({ w: 800, h: 600 }, 180)).toEqual({ w: 800, h: 600 });
  });

  it("90 và 270 độ đổi chỗ rộng/cao", () => {
    expect(rotatedSize({ w: 800, h: 600 }, 90)).toEqual({ w: 600, h: 800 });
    expect(rotatedSize({ w: 800, h: 600 }, 270)).toEqual({ w: 600, h: 800 });
  });
});

describe("fullRect", () => {
  it("trả về khung trọn vẹn ảnh", () => {
    expect(fullRect({ w: 800, h: 600 })).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });
});

describe("clampRect", () => {
  const bounds = { w: 800, h: 600 };

  it("khung đã nằm gọn thì giữ nguyên", () => {
    expect(clampRect({ x: 10, y: 10, w: 100, h: 100 }, bounds)).toEqual({ x: 10, y: 10, w: 100, h: 100 });
  });

  it("khung lớn hơn ảnh thì co vừa khung ảnh", () => {
    expect(clampRect({ x: 0, y: 0, w: 1000, h: 900 }, bounds)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("tọa độ âm hoặc vượt mép phải/dưới thì kẹp lại, giữ kích thước", () => {
    expect(clampRect({ x: -50, y: -20, w: 100, h: 80 }, bounds)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(clampRect({ x: 750, y: 580, w: 100, h: 80 }, bounds)).toEqual({ x: 700, y: 520, w: 100, h: 80 });
  });

  it("nhỏ hơn minSize thì lớn lên đúng minSize (nếu bounds đủ chỗ)", () => {
    expect(clampRect({ x: 0, y: 0, w: 5, h: 5 }, bounds, 20)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("bounds nhỏ hơn minSize thì chỉ co vừa bounds, không vượt quá", () => {
    expect(clampRect({ x: 0, y: 0, w: 5, h: 5 }, { w: 10, h: 10 }, 20)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});

describe("moveRect", () => {
  const bounds = { w: 800, h: 600 };
  const rect = { x: 100, y: 100, w: 200, h: 150 };

  it("di chuyển trong khung thì cộng thẳng dx/dy, giữ nguyên kích thước", () => {
    expect(moveRect(rect, 50, -30, bounds)).toEqual({ x: 150, y: 70, w: 200, h: 150 });
  });

  it("kéo quá mép thì dừng khít tại mép, không vượt khung ảnh", () => {
    expect(moveRect(rect, 1000, 0, bounds)).toEqual({ x: 600, y: 100, w: 200, h: 150 });
    expect(moveRect(rect, 0, -1000, bounds)).toEqual({ x: 100, y: 0, w: 200, h: 150 });
  });
});

describe("resizeRect", () => {
  const bounds = { w: 800, h: 600 };
  const rect = { x: 100, y: 100, w: 200, h: 150 }; // góc: nw(100,100) ne(300,100) sw(100,250) se(300,250)

  it("kéo góc se ra xa thì rộng/cao tăng, góc nw (đối diện) đứng yên", () => {
    expect(resizeRect(rect, "se", 50, 20, bounds)).toEqual({ x: 100, y: 100, w: 250, h: 170 });
  });

  it("kéo góc nw ra xa (lên trên-trái) thì x/y giảm, rộng/cao tăng, góc se đứng yên", () => {
    expect(resizeRect(rect, "nw", -30, -10, bounds)).toEqual({ x: 70, y: 90, w: 230, h: 160 });
  });

  it("kéo góc ne: x cố định bên trái (nw.x), y/h đổi theo trên, rộng đổi theo phải", () => {
    expect(resizeRect(rect, "ne", 40, 20, bounds)).toEqual({ x: 100, y: 120, w: 240, h: 130 });
  });

  it("kéo góc sw: y cố định bên trên (ne.y), x/rộng đổi theo trái, cao đổi theo dưới", () => {
    expect(resizeRect(rect, "sw", -40, 30, bounds)).toEqual({ x: 60, y: 100, w: 240, h: 180 });
  });

  it("kéo vượt mép ảnh thì góc đang kéo dừng khít mép, không vượt khung ảnh", () => {
    expect(resizeRect(rect, "se", 10000, 10000, bounds)).toEqual({ x: 100, y: 100, w: 700, h: 500 });
    expect(resizeRect(rect, "nw", -10000, -10000, bounds)).toEqual({ x: 0, y: 0, w: 300, h: 250 });
  });

  it("kéo ngược qua góc đối diện vẫn ra khung hợp lệ (không âm rộng/cao)", () => {
    const r = resizeRect(rect, "se", -250, -200, bounds);
    expect(r.w).toBeGreaterThanOrEqual(0);
    expect(r.h).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(100);
    expect(r.y).toBeLessThanOrEqual(100);
  });

  it("không nhỏ hơn minSize khi còn đủ chỗ", () => {
    const r = resizeRect(rect, "se", -195, -145, bounds, 20);
    expect(r.w).toBeGreaterThanOrEqual(20);
    expect(r.h).toBeGreaterThanOrEqual(20);
  });
});
