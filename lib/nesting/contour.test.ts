import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contourForNesting, geometryFromMask, geometryFromRgba, maskFromRgba, measureGeometry, traceLoops, type Mask } from "./contour";
import { polygonArea, polygonPerimeter, polygonsTooClose, pointInPolygon, rotatePolygon90, simplifyRing, segmentDistance } from "./geometry";
import { loadLogoGeometry } from "./logo-image";

function makeMask(w: number, h: number, fn: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fn(x, y) ? 1 : 0;
  return { width: w, height: h, data };
}
const flags = { hasTransparency: true, backgroundRemoved: false };
const discFn = (cx: number, cy: number, r: number) => (x: number, y: number) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;

describe("hình học cơ bản", () => {
  it("diện tích và chu vi hình vuông", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(Math.abs(polygonArea(sq))).toBe(100);
    expect(polygonPerimeter(sq)).toBe(40);
  });

  it("khoảng cách giữa hai đoạn", () => {
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(5);
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0); // cắt nhau
  });

  it("hai đa giác: xa, sát, chồng, và hình này nằm trong hình kia", () => {
    const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
    expect(polygonsTooClose(sq(0, 0, 10), sq(30, 0, 10), 5)).toBe(false);
    expect(polygonsTooClose(sq(0, 0, 10), sq(13, 0, 10), 5)).toBe(true); // cách 3 < 5
    expect(polygonsTooClose(sq(0, 0, 10), sq(15, 0, 10), 5)).toBe(false); // vừa đủ 5
    expect(polygonsTooClose(sq(0, 0, 10), sq(5, 5, 10), 1)).toBe(true); // chồng
    expect(polygonsTooClose(sq(0, 0, 100), sq(40, 40, 10), 1)).toBe(true); // nằm trong
    expect(pointInPolygon({ x: 5, y: 5 }, sq(0, 0, 10))).toBe(true);
  });

  it("xoay 90° theo chiều kim đồng hồ: khung w x h thành h x w", () => {
    const r = rotatePolygon90([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 0, y: 10 }], 10);
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(10);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(40);
  });

  it("đơn giản hóa bỏ các điểm thẳng hàng", () => {
    const ring = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(simplifyRing(ring, 0.1)).toHaveLength(4);
  });
});

describe("dò đường biên từ mặt nạ", () => {
  it("một điểm ảnh cho một vòng 4 đỉnh, diện tích 1", () => {
    const loops = traceLoops(makeMask(3, 3, (x, y) => x === 1 && y === 1));
    expect(loops).toHaveLength(1);
    expect(loops[0].area).toBe(1);
    expect(loops[0].points).toHaveLength(4);
  });

  it("hình có lỗ cho một mảnh ngoài (dương) và một lỗ (âm)", () => {
    const loops = traceLoops(makeMask(10, 10, (x, y) => !(x >= 4 && x < 6 && y >= 4 && y < 6)));
    const outer = loops.filter((l) => l.area > 0);
    const hole = loops.filter((l) => l.area < 0);
    expect(outer).toHaveLength(1);
    expect(hole).toHaveLength(1);
    expect(outer[0].area).toBe(100);
    expect(hole[0].area).toBe(-4);
  });

  it("hai điểm ảnh chạm chéo vẫn khép kín được mọi cạnh", () => {
    const loops = traceLoops(makeMask(2, 2, (x, y) => x === y));
    expect(loops.reduce((s, l) => s + Math.abs(l.area), 0)).toBe(2);
  });
});

describe("hình học logo từ mặt nạ", () => {
  it("hình tròn: khung bao vuông, diện tích ~ pi/4, chu vi ~ pi*d", () => {
    const g = geometryFromMask(makeMask(120, 120, discFn(60, 60, 50)), flags);
    expect(g.fallbackRect).toBe(false);
    expect(g.widthHeightRatio).toBeCloseTo(1, 1);
    expect(g.areaFraction).toBeGreaterThan(0.77);
    expect(g.areaFraction).toBeLessThan(0.8);
    const m = measureGeometry(g, 50, 50);
    expect(m.perimeterMm).toBeGreaterThan(Math.PI * 50 * 0.97);
    expect(m.perimeterMm).toBeLessThan(Math.PI * 50 * 1.03);
    expect(m.areaMm2).toBeCloseTo(g.areaFraction * 2500, 6);
  });

  it("cắt sát nội dung: logo nằm lệch trong ảnh rộng thì tỉ lệ là của khung bao thật", () => {
    const g = geometryFromMask(makeMask(200, 100, (x, y) => x >= 30 && x < 130 && y >= 40 && y < 60), flags);
    expect(g.widthHeightRatio).toBeCloseTo(5, 5); // 100 x 20
    expect(g.areaFraction).toBeCloseTo(1, 6);
  });

  it("chữ O: một mảnh ngoài và một lỗ; chu vi cắt tính cả lỗ", () => {
    const ring = makeMask(100, 100, (x, y) => discFn(50, 50, 48)(x, y) && !discFn(50, 50, 25)(x, y));
    const g = geometryFromMask(ring, flags);
    expect(g.outers).toHaveLength(1);
    expect(g.holes).toHaveLength(1);
    const m = measureGeometry(g, 96, 96);
    expect(m.perimeterMm).toBeGreaterThan(Math.PI * (96 + 50) * 0.95);
    expect(m.areaMm2).toBeLessThan(96 * 96 * 0.78);
  });

  it("nhiều mảnh rời cho nhiều mảnh ngoài", () => {
    const g = geometryFromMask(makeMask(100, 40, (x, y) => (x < 30 || x >= 70) && y >= 10 && y < 30), flags);
    expect(g.outers).toHaveLength(2);
    expect(g.widthHeightRatio).toBeCloseTo(100 / 20, 5);
  });

  it("đốm nhiễu 1 điểm ảnh bị bỏ, không làm phình khung bao", () => {
    const g = geometryFromMask(makeMask(200, 200, (x, y) => (x >= 50 && x < 150 && y >= 50 && y < 150) || (x === 5 && y === 5)), flags);
    expect(g.outers).toHaveLength(1);
    expect(g.widthHeightRatio).toBeCloseTo(1, 5);
  });

  it("mặt nạ rỗng thì dùng khung chữ nhật kèm cảnh báo", () => {
    const g = geometryFromMask(makeMask(10, 10, () => false), flags);
    expect(g.fallbackRect).toBe(true);
    expect(g.warnings.join(" ")).toMatch(/khung chữ nhật/);
  });

  it("đường viền cho xếp so le có số đỉnh gọn và có sai số", () => {
    const g = geometryFromMask(makeMask(400, 400, discFn(200, 200, 190)), flags);
    const c = contourForNesting(g, 50, 50)!;
    expect(c.outers).toHaveLength(1);
    expect(c.outers[0].length).toBeLessThanOrEqual(96);
    expect(c.outers[0].length).toBeGreaterThan(8);
    expect(c.toleranceMm).toBeGreaterThan(0);
    expect(c.toleranceMm).toBeLessThan(1);
  });

  it("khung chữ nhật dự phòng thì không có đường viền để xếp so le", () => {
    expect(contourForNesting(geometryFromMask(makeMask(10, 10, () => false), flags), 50, 50)).toBeUndefined();
  });
});

function rgbaOf(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(px(x, y), (y * w + x) * 4);
  return d;
}

describe("từ ảnh RGBA", () => {
  const inDisc = discFn(50, 50, 40);

  it("nền trong suốt thì dùng kênh alpha", () => {
    const g = geometryFromRgba(rgbaOf(100, 100, (x, y) => (inDisc(x, y) ? [200, 30, 30, 255] : [0, 0, 0, 0])), 100, 100);
    expect(g.hasTransparency).toBe(true);
    expect(g.backgroundRemoved).toBe(false);
    expect(g.fallbackRect).toBe(false);
    expect(g.widthHeightRatio).toBeCloseTo(1, 1);
  });

  it("nền trắng đặc thì tự tách nền theo màu viền và cảnh báo", () => {
    const g = geometryFromRgba(rgbaOf(100, 100, (x, y) => (inDisc(x, y) ? [20, 20, 20, 255] : [255, 255, 255, 255])), 100, 100);
    expect(g.hasTransparency).toBe(false);
    expect(g.backgroundRemoved).toBe(true);
    expect(g.fallbackRect).toBe(false);
    expect(g.warnings.join(" ")).toMatch(/tách nền tự động/);
    expect(g.areaFraction).toBeGreaterThan(0.77);
  });

  it("phần trắng nằm trong logo (không nối với viền) vẫn là nội dung", () => {
    const g = geometryFromRgba(
      rgbaOf(100, 100, (x, y) => (discFn(50, 50, 40)(x, y) ? (discFn(50, 50, 15)(x, y) ? [255, 255, 255, 255] : [20, 20, 20, 255]) : [255, 255, 255, 255])),
      100,
      100,
    );
    expect(g.backgroundRemoved).toBe(true);
    expect(g.holes).toHaveLength(0); // lõi trắng bị bao quanh bởi logo: là nội dung, không phải lỗ
    expect(g.areaFraction).toBeGreaterThan(0.77);
  });

  it("ảnh đặc nhiễu không có màu nền rõ ràng thì dùng khung chữ nhật và cảnh báo", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 255;
    const g = geometryFromRgba(rgbaOf(60, 40, () => [rnd(), rnd(), rnd(), 255]), 60, 40);
    expect(g.fallbackRect).toBe(true);
    expect(g.warnings.join(" ")).toMatch(/Logo chưa tách nền, đang tính theo khung chữ nhật/);
    expect(g.widthHeightRatio).toBeCloseTo(1.5, 6);
    expect(measureGeometry(g, 100, 50)).toEqual({ perimeterMm: 300, areaMm2: 5000 });
  });

  it("ảnh một màu thì không tách được nội dung", () => {
    expect(maskFromRgba(rgbaOf(20, 20, () => [255, 255, 255, 255]), 20, 20)).toBeNull();
  });
});

describe("đọc PNG thật bằng sharp", () => {
  it("PNG nền trong suốt: lấy đúng khung bao và diện tích", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><circle cx="150" cy="150" r="100" fill="#c00"/></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const g = await loadLogoGeometry(png);
    expect(g.hasTransparency).toBe(true);
    expect(g.fallbackRect).toBe(false);
    expect(g.widthHeightRatio).toBeCloseTo(1, 1); // cắt sát hình tròn, bỏ phần trống bên phải
    expect(g.areaFraction).toBeGreaterThan(0.76);
    expect(g.areaFraction).toBeLessThan(0.81);
  });
});
