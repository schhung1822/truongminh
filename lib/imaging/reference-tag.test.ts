import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tagReference } from "./reference-tag";

function solid(w: number, h: number, color: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
}

async function pixel(img: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(img).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

describe("tagReference", () => {
  it("thêm một dải trắng phía trên, ảnh tham chiếu giữ nguyên bề ngang và nằm ngay dưới dải", async () => {
    const ref = await solid(2000, 1024, "#3050c0");
    const out = await tagReference(ref, { cell: 3, kind: "ENGRAVE" });
    const meta = await sharp(out).metadata();
    const strip = Math.round(1024 * 0.14);
    expect([meta.width, meta.height]).toEqual([2000, 1024 + strip]);
    // giữa dải là nền trắng, dưới dải là ảnh gốc (màu xanh)
    const [r, g, b] = await pixel(out, 1000, 4);
    expect(Math.min(r, g, b)).toBeGreaterThan(235);
    const below = await pixel(out, 1000, strip + 200);
    expect(below[2]).toBeGreaterThan(below[0] + 60);
  });

  it("có ô số nền tối ở đầu dải (góc trái)", async () => {
    const out = await tagReference(await solid(2000, 1024, "#ffffff"), { cell: 7, kind: "CUT" });
    const strip = Math.round(1024 * 0.14);
    const pad = Math.round(strip * 0.2);
    const [r, g, b] = await pixel(out, pad + 4, Math.round(strip / 2));
    expect(Math.max(r, g, b)).toBeLessThan(80);
  });

  it("ảnh hẹp vẫn vẽ được, không vượt bề ngang", async () => {
    const out = await tagReference(await solid(500, 1024, "#888888"), { cell: 10, kind: "ENGRAVE" });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(500);
  });
});
