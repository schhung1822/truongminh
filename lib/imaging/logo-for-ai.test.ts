import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareLogoForAi } from "./logo-for-ai";

/** Logo giả: hình chữ nhật màu `color` ở giữa, nền trong suốt (RGB của vùng trong suốt = 0 như file thật). */
async function transparentLogo(color: { r: number; g: number; b: number }) {
  const rect = await sharp({ create: { width: 200, height: 80, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 400, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rect, left: 100, top: 40 }])
    .png()
    .toBuffer();
}

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("prepareLogoForAi", () => {
  it("logo đen nền trong suốt -> đặt lên nền TRẮNG, thấy rõ hình logo", async () => {
    const r = await prepareLogoForAi(await transparentLogo({ r: 0, g: 0, b: 0 }));
    expect(r.background).toBe("light");
    const meta = await sharp(r.buffer).metadata();
    expect(meta.hasAlpha).toBe(false);
    expect(await pixel(r.buffer, 3, 3)).toEqual([255, 255, 255]); // góc: nền trắng
    const c = await pixel(r.buffer, Math.round(meta.width! / 2), Math.round(meta.height! / 2));
    expect(c[0]).toBeLessThan(30); // giữa: logo đen
  });

  it("logo trắng nền trong suốt -> đặt lên nền TỐI", async () => {
    const r = await prepareLogoForAi(await transparentLogo({ r: 255, g: 255, b: 255 }));
    expect(r.background).toBe("dark");
    expect(await pixel(r.buffer, 3, 3)).toEqual([38, 38, 38]);
    const meta = await sharp(r.buffer).metadata();
    const c = await pixel(r.buffer, Math.round(meta.width! / 2), Math.round(meta.height! / 2));
    expect(c[0]).toBeGreaterThan(225);
  });

  it("logo màu đậm (xanh navy) -> nền trắng; logo màu sáng (vàng) -> nền tối", async () => {
    expect((await prepareLogoForAi(await transparentLogo({ r: 20, g: 30, b: 120 }))).background).toBe("light");
    expect((await prepareLogoForAi(await transparentLogo({ r: 250, g: 220, b: 40 }))).background).toBe("dark");
  });

  it("chừa lề quanh logo (ảnh to hơn ảnh gốc)", async () => {
    const src = await transparentLogo({ r: 0, g: 0, b: 0 });
    const m0 = await sharp(src).metadata();
    const r = await prepareLogoForAi(src);
    const m1 = await sharp(r.buffer).metadata();
    expect(m1.width!).toBeGreaterThan(m0.width!);
    expect(m1.height!).toBeGreaterThan(m0.height!);
  });

  it("ảnh đặc (JPG, không trong suốt) giữ nguyên", async () => {
    const jpg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#336699" } }).png().toBuffer();
    const r = await prepareLogoForAi(jpg);
    expect(r.background).toBe("none");
    expect(r.buffer.equals(jpg)).toBe(true);
  });

  it("ảnh có kênh trong suốt nhưng đặc hoàn toàn thì giữ nguyên", async () => {
    const opaque = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).png().toBuffer();
    expect((await prepareLogoForAi(opaque)).background).toBe("none");
  });
});
