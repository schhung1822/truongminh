import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { finishImage } from "./finish-image";

async function original(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#dde8f0" } }).png().toBuffer();
}

const cells = Array.from({ length: 4 }, (_, i) => ({ code: `V0${i + 1}`, name: `Chất liệu số ${i + 1} khá dài để thử cắt chữ` }));
const common = {
  brandName: "Cà phê Ánh Dương",
  title: "Trang vải 1",
  cols: 2,
  rows: 2,
  cells,
  workshopName: "Xưởng in Thanh Bình",
  footerNote: "Ảnh mô phỏng, màu sắc thực tế có thể chênh lệch",
};

describe("finishImage", () => {
  it("giữ nguyên chiều rộng, thêm đầu trang và chân trang (overlay)", async () => {
    const out = await finishImage({ ...common, original: await original(800, 1200), labelMode: "overlay" });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(800);
    expect(meta.height).toBeGreaterThan(1200);
    // đầu trang = 0.115W, chân trang = 0.1W
    expect(meta.height).toBe(1200 + Math.round(800 * 0.115) + Math.round(800 * 0.1));
  });

  it("chế độ legend thêm bảng chú giải nên cao hơn overlay", async () => {
    const ov = await sharp(await finishImage({ ...common, original: await original(800, 1200), labelMode: "overlay" })).metadata();
    const lg = await sharp(await finishImage({ ...common, original: await original(800, 1200), labelMode: "legend" })).metadata();
    expect(lg.height!).toBeGreaterThan(ov.height!);
  });

  it("overlay vẽ dải nhãn tối ở đáy mỗi ô", async () => {
    const out = await finishImage({ ...common, original: await original(800, 1200), labelMode: "overlay" });
    const headerH = Math.round(800 * 0.115);
    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const lum = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return (raw.data[i] + raw.data[i + 1] + raw.data[i + 2]) / 3;
    };
    // giữa ô 1 (hàng 1) cao khoảng 600, dải nhãn ở sát đáy ô, lệch nhẹ khỏi chữ (x sát mép trái)
    const yInStrip = headerH + 600 - 4;
    const yInCell = headerH + 300;
    expect(lum(6, yInStrip)).toBeLessThan(120); // tối
    expect(lum(6, yInCell)).toBeGreaterThan(200); // nền ảnh sáng
  });

  it("không có nhãn thì chỉ thêm đầu/chân trang; tên xưởng trống vẫn chạy", async () => {
    const out = await finishImage({
      ...common,
      workshopName: "",
      original: await original(1000, 1000),
      cols: 1,
      rows: 1,
      cells: [cells[0]],
      labelMode: "none",
    });
    expect((await sharp(out).metadata()).width).toBe(1000);
  });

  it("tên thương hiệu quá dài vẫn vừa khổ ảnh (không làm lệch kích thước)", async () => {
    const out = await finishImage({
      ...common,
      brandName: "Một thương hiệu có cái tên dài dằng dặc ".repeat(6),
      original: await original(600, 900),
      labelMode: "overlay",
    });
    expect((await sharp(out).metadata()).width).toBe(600);
  });
});
