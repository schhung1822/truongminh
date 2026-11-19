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

  it("nhãn overlay là thẻ nhỏ ở góc dưới PHẢI mỗi ô, không đụng vào giữa ô và góc trái", async () => {
    const orig = await original(800, 1200);
    const withLabels = await finishImage({ ...common, original: orig, labelMode: "overlay" });
    const without = await finishImage({ ...common, original: orig, labelMode: "none" });
    const headerH = layoutMetrics(800, { hasWorkshop: true, hasNote: false }).headerH;
    // ô 1 chiếm x 0..400, y 0..600 của ảnh gốc
    const bottomRight = { left: 400 - 8 - 200, top: headerH + 600 - 50, width: 200, height: 40 };
    const bottomLeft = { left: 8, top: headerH + 600 - 50, width: 60, height: 40 };
    const centre = { left: 150, top: headerH + 200, width: 100, height: 100 };
    expect(await diffCount(withLabels, without, bottomRight)).toBeGreaterThan(300);
    expect(await diffCount(withLabels, without, bottomLeft)).toBe(0);
    expect(await diffCount(withLabels, without, centre)).toBe(0);
  });

  it("dòng ghi chú chân ảnh (Hình minh họa): thêm chiều cao chân trang và có chữ vẽ ở chân ảnh", async () => {
    const orig = await original(800, 1200);
    const base = { ...common, original: orig, labelMode: "none" as const };
    const without = await finishImage({ ...base });
    const withNote = await finishImage({ ...base, footerDisclaimer: "Hình minh họa" });
    const m0 = layoutMetrics(800, { hasWorkshop: true, hasNote: false });
    const m1 = layoutMetrics(800, { hasWorkshop: true, hasNote: false, hasDisclaimer: true });
    expect(m1.footerH).toBeGreaterThan(m0.footerH);
    const h0 = (await sharp(without).metadata()).height!;
    const h1 = (await sharp(withNote).metadata()).height!;
    expect(h1 - h0).toBe(m1.footerH - m0.footerH);
    // phần chân trang của ảnh có ghi chú phải khác ảnh không ghi chú (có thêm chữ ở dòng dưới tên xưởng)
    const tail = { left: 0, top: h1 - m1.footerH, width: 800, height: m1.footerH };
    const blank = await sharp({ create: { width: 800, height: m1.footerH, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect(await diffCount(withNote, await sharp(blank).extend({ top: h1 - m1.footerH, bottom: 0, background: "#ffffff" }).png().toBuffer(), tail)).toBeGreaterThan(100);
  });

  it("chọn vị trí nhãn: trên trái đặt nhãn ở góc trên trái ô, góc dưới phải trống", async () => {
    const orig = await original(800, 1200);
    const topLeft = await finishImage({ ...common, original: orig, labelMode: "overlay", labelPos: "tl" });
    const without = await finishImage({ ...common, original: orig, labelMode: "none" });
    const headerH = layoutMetrics(800, { hasWorkshop: true, hasNote: false }).headerH;
    const topLeftArea = { left: 8, top: headerH + 8, width: 150, height: 30 };
    const bottomRightArea = { left: 400 - 8 - 200, top: headerH + 600 - 50, width: 200, height: 40 };
    expect(await diffCount(topLeft, without, topLeftArea)).toBeGreaterThan(200);
    expect(await diffCount(topLeft, without, bottomRightArea)).toBe(0);
  });

  it("thẻ gọn: hẹp hơn thẻ đầy đủ (tối đa 40% bề rộng ô) và vẫn ở đúng vị trí; tên dài xuống dòng", async () => {
    const orig = await original(800, 1200);
    const longName = [{ code: "TRANG-GUONG-VANG-HT-10472-12", name: "Tráng gương vàng HT 10472-12 2 màu rất dài để thử xuống dòng", groupName: "Giả gương", printTech: "Cắt laser" }];
    const base = { ...common, cols: 1, rows: 1, cells: longName, original: orig };
    const full = await finishImage({ ...base, labelMode: "overlay", labelPos: "br" });
    const compact = await finishImage({ ...base, labelMode: "compact", labelPos: "br" });
    const without = await finishImage({ ...base, labelMode: "none" });
    const headerH = layoutMetrics(800, { hasWorkshop: true, hasNote: false }).headerH;
    // ô duy nhất rộng 800: thẻ gọn nằm trong 40% bề rộng bên phải (x >= 800 - 8 - 320), thẻ đầy đủ chiếm rộng hơn nhiều
    const leftPart = { left: 0, top: headerH, width: 800 - 8 - 330, height: 1200 };
    expect(await diffCount(compact, without, leftPart)).toBe(0);
    expect(await diffCount(full, without, leftPart)).toBeGreaterThan(200);
    expect(await diffCount(compact, without, { left: 800 - 330, top: headerH + 1200 - 140, width: 322, height: 132 })).toBeGreaterThan(300);
  });

  it("kiểu đánh số + chú giải: không có thẻ trong ô nên ảnh cao hơn; ẩn nhãn thì không vẽ gì", async () => {
    const orig = await original(800, 1200);
    const none = await finishImage({ ...common, original: orig, labelMode: "none" });
    const legend = await sharp(await finishImage({ ...common, original: orig, labelMode: "legend" })).metadata();
    expect(legend.height!).toBeGreaterThan((await sharp(none).metadata()).height!);
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
