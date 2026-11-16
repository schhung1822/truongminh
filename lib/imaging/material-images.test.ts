import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composeReference, processMaterialImage } from "./material-images";

async function solid(width: number, height: number, color: string, alpha = false) {
  return sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: color },
  })
    .png()
    .toBuffer();
}

describe("processMaterialImage", () => {
  it("thu nhỏ ảnh lớn về cạnh dài 2048", async () => {
    const out = await processMaterialImage(await solid(4000, 3000, "#336699"));
    expect(Math.max(out.width, out.height)).toBe(2048);
    expect(out.ext).toBe("jpg");
  });

  it("giữ PNG khi ảnh có nền trong suốt", async () => {
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    expect((await processMaterialImage(buf)).ext).toBe("png");
  });

  it("từ chối file không phải ảnh", async () => {
    await expect(processMaterialImage(Buffer.from("không phải ảnh"))).rejects.toThrow(/ảnh/);
  });
});

describe("composeReference", () => {
  it("ghép hai lớp cạnh nhau, cùng chiều cao 1024", async () => {
    const out = await composeReference(await solid(800, 800, "#ff0000"), await solid(400, 800, "#0000ff"));
    expect(out.height).toBe(1024);
    // lớp 1 vuông -> 1024 rộng, lớp 2 tỉ lệ 1:2 -> 512 rộng, cộng khoảng cách 16
    expect(out.width).toBe(1024 + 16 + 512);

    const raw = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    const left = px(100, 500);
    const right = px(out.width - 100, 500);
    expect(left[0]).toBeGreaterThan(200); // đỏ
    expect(right[2]).toBeGreaterThan(200); // xanh
  });
});
