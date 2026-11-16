import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeLogo } from "./normalize-logo";

const png = (w: number, h: number, alpha = false) =>
  sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 200, g: 30, b: 30, alpha: alpha ? 0 : 1 },
    },
  })
    .png()
    .toBuffer();

describe("normalizeLogo", () => {
  it("thu nhỏ logo lớn về cạnh dài 2048 và xuất PNG", async () => {
    const r = await normalizeLogo(await png(4096, 2048));
    expect(Math.max(r.width, r.height)).toBe(2048);
    expect(r.tooSmall).toBe(false);
    expect((await sharp(r.png).metadata()).format).toBe("png");
  });

  it("không phóng to logo nhỏ và cảnh báo dưới 500px", async () => {
    const r = await normalizeLogo(await png(300, 200));
    expect(r.width).toBe(300);
    expect(r.tooSmall).toBe(true);
  });

  it("giữ nền trong suốt", async () => {
    const r = await normalizeLogo(await png(600, 600, true));
    expect((await sharp(r.png).metadata()).hasAlpha).toBe(true);
    const px = await sharp(r.png).ensureAlpha().raw().toBuffer();
    expect(px[3]).toBe(0);
  });

  it("đọc được SVG và không coi là logo nhỏ", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="red"/></svg>');
    const r = await normalizeLogo(svg);
    expect(r.originalExt).toBe("svg");
    expect(Math.max(r.width, r.height)).toBeGreaterThanOrEqual(1000);
    expect(r.tooSmall).toBe(false);
  });

  it("từ chối file không phải ảnh và định dạng không hỗ trợ", async () => {
    await expect(normalizeLogo(Buffer.from("abc"))).rejects.toThrow(/ảnh/);
    const gif = await sharp(await png(50, 50)).gif().toBuffer();
    await expect(normalizeLogo(gif)).rejects.toThrow(/PNG, JPG/);
  });
});
