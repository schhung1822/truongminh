import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { stitchTiles } from "./stitch";

/** Ảnh một màu để nhận ra mảnh nào nằm ở đâu sau khi ghép. */
function solid(size: number, color: string): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: color } }).png().toBuffer();
}

async function pixel(img: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(img).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

describe("stitchTiles", () => {
  it("hai mảnh 4 ô ghép dọc thành ảnh rộng bằng một mảnh, cao gấp đôi, đúng thứ tự trên dưới", async () => {
    const out = await stitchTiles([
      { buffer: await solid(400, "#ff0000"), count: 4 },
      { buffer: await solid(400, "#0000ff"), count: 4 },
    ]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([400, 800]);
    expect(await pixel(out, 200, 100)).toEqual([255, 0, 0]);
    expect(await pixel(out, 200, 700)).toEqual([0, 0, 255]);
  });

  it("mảnh cuối chỉ 2 chất liệu thì cắt bỏ hàng trống phía dưới", async () => {
    const out = await stitchTiles([
      { buffer: await solid(400, "#ff0000"), count: 4 },
      { buffer: await solid(400, "#00ff00"), count: 2 },
    ]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([400, 600]);
    expect(await pixel(out, 10, 590)).toEqual([0, 255, 0]);
  });

  it("mảnh khác kích thước được đưa về cùng cỡ với mảnh đầu", async () => {
    const out = await stitchTiles([
      { buffer: await solid(400, "#ff0000"), count: 4 },
      { buffer: await solid(256, "#0000ff"), count: 3 },
    ]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([400, 800]);
  });

  it("một mảnh 1 chất liệu ra ảnh một hàng", async () => {
    const out = await stitchTiles([{ buffer: await solid(400, "#ff0000"), count: 1 }]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([400, 200]);
  });

  it("không có mảnh nào thì báo lỗi", async () => {
    await expect(stitchTiles([])).rejects.toThrow();
  });
});
