import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { finishImage, layoutMetrics } from "./finish-image";

async function original(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#dde8f0" } }).png().toBuffer();
}

const cells = Array.from({ length: 4 }, (_, i) => ({
  code: `V0${i + 1}`,
  name: `Chất liệu số ${i + 1} khá dài để thử cắt chữ`,
  groupName: "Vải",
  printTech: "In UV",
}));
const common = {
  brandName: "Cà phê Ánh Dương",
  imageLabel: "Ảnh 1",
  cols: 2,
  rows: 2,
  cells,
  workshopName: "Xưởng in Trường Minh",
  footerNote: "",
};

/** Số điểm ảnh khác nhau giữa hai ảnh trong một vùng. */
async function diffCount(a: Buffer, b: Buffer, region: { left: number; top: number; width: number; height: number }) {
  const [ra, rb] = await Promise.all(
    [a, b].map((x) => sharp(x).extract(region).raw().toBuffer()),
  );
  let n = 0;
  for (let i = 0; i < ra.length; i += 3) {
    if (Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]) > 30) n++;
  }
  return n;
}

describe("finishImage", () => {
  it("giữ nguyên chiều rộng; thêm đầu trang một dòng và chân trang nhỏ", async () => {
    const out = await finishImage({ ...common, original: await original(800, 1200), labelMode: "overlay" });
    const meta = await sharp(out).metadata();
    const m = layoutMetrics(800, { hasWorkshop: true, hasNote: false });
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1200 + m.headerH + m.footerH);
    // chân trang kín đáo: nhỏ hơn đầu trang
    expect(m.footerH).toBeLessThan(m.headerH);
  });

  it("có dòng chú thích thì chân trang cao hơn, không có xưởng và không có chú thích thì rất mỏng", () => {
    const base = layoutMetrics(1000, { hasWorkshop: true, hasNote: false }).footerH;
    expect(layoutMetrics(1000, { hasWorkshop: true, hasNote: true }).footerH).toBeGreaterThan(base);
    expect(layoutMetrics(1000, { hasWorkshop: false, hasNote: false }).footerH).toBeLessThan(base);
  });

  it("nhãn overlay là thẻ nhỏ ở góc dưới trái mỗi ô, không đụng vào giữa ô", async () => {
    const orig = await original(800, 1200);
    const withLabels = await finishImage({ ...common, original: orig, labelMode: "overlay" });
    const without = await finishImage({ ...common, original: orig, labelMode: "none" });
    const headerH = layoutMetrics(800, { hasWorkshop: true, hasNote: false }).headerH;
    // ô 1 chiếm x 0..400, y 0..600 của ảnh gốc
    const bottomLeft = { left: 8, top: headerH + 600 - 70, width: 300, height: 60 };
    const centre = { left: 150, top: headerH + 200, width: 100, height: 100 };
    expect(await diffCount(withLabels, without, bottomLeft)).toBeGreaterThan(500);
    expect(await diffCount(withLabels, without, centre)).toBe(0);
  });

  it("chế độ legend thêm bảng chú giải nên cao hơn overlay", async () => {
    const ov = await sharp(await finishImage({ ...common, original: await original(800, 1200), labelMode: "overlay" })).metadata();
    const lg = await sharp(await finishImage({ ...common, original: await original(800, 1200), labelMode: "legend" })).metadata();
    expect(lg.height!).toBeGreaterThan(ov.height!);
  });

  it("thiếu loại/công nghệ in, thiếu nhãn ảnh, tên xưởng trống: vẫn chạy", async () => {
    const out = await finishImage({
      ...common,
      imageLabel: undefined,
      workshopName: "",
      original: await original(1000, 1000),
      cols: 1,
      rows: 1,
      cells: [{ code: "A", name: "Chỉ có mã và tên" }],
      labelMode: "overlay",
    });
    expect((await sharp(out).metadata()).width).toBe(1000);
  });

  it("tên thương hiệu và tên chất liệu quá dài vẫn vừa khổ ảnh", async () => {
    const out = await finishImage({
      ...common,
      brandName: "Một thương hiệu có cái tên dài dằng dặc ".repeat(6),
      cells: cells.map((c) => ({ ...c, name: c.name.repeat(5) })),
      original: await original(600, 900),
      labelMode: "overlay",
    });
    expect((await sharp(out).metadata()).width).toBe(600);
  });
});
