import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { toJpeg, toWebp, WEBP_QUALITY } from "./webp";

const png = (w = 64, h = 64, alpha = false) =>
  sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 255, g: 0, b: 0, alpha: 0 } : { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer();

describe("toWebp", () => {
  it("nén PNG và JPEG sang WebP, giữ kích thước", async () => {
    const out = await toWebp(await png(80, 50));
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp");
    expect([m.width, m.height]).toEqual([80, 50]);
    const jpg = await sharp(await png()).jpeg().toBuffer();
    expect((await sharp(await toWebp(jpg)).metadata()).format).toBe("webp");
  });

  it("giữ kênh trong suốt", async () => {
    const out = await toWebp(await png(32, 32, true));
    expect((await sharp(out).metadata()).hasAlpha).toBe(true);
  });

  it("chất lượng mặc định là 82 và nhỏ hơn bản chất lượng cao", async () => {
    expect(WEBP_QUALITY).toBe(82);
    const noisy = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer();
    expect((await toWebp(noisy)).length).toBeLessThan((await toWebp(noisy, 100)).length);
  });

  it("ném lỗi khi không phải ảnh", async () => {
    await expect(toWebp(Buffer.from("không phải ảnh"))).rejects.toThrow();
  });
});

describe("toJpeg", () => {
  it("WebP và PNG thành JPEG", async () => {
    const webp = await toWebp(await png());
    expect((await sharp(await toJpeg(webp)).metadata()).format).toBe("jpeg");
    expect((await sharp(await toJpeg(await png())).metadata()).format).toBe("jpeg");
  });

  it("đã là JPEG thì trả nguyên, không nén lại", async () => {
    const jpg = await sharp(await png()).jpeg().toBuffer();
    expect(await toJpeg(jpg)).toBe(jpg);
  });

  it("ảnh trong suốt được đặt lên nền trắng", async () => {
    const out = await toJpeg(await png(8, 8, true));
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
    expect(data[1]).toBeGreaterThan(240);
    expect(data[2]).toBeGreaterThan(240);
  });
});
