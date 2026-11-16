import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildPdf, buildZip, uniqueFileNames } from "./build";

const jpeg = (w: number, h: number, color: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();

describe("uniqueFileNames", () => {
  it("làm sạch ký tự cấm và đánh số khi trùng tên", () => {
    expect(uniqueFileNames(["A: B.jpg", "A: B.jpg", "a: b.jpg", "x/y.jpg"])).toEqual(["A B.jpg", "A B (2).jpg", "a b (3).jpg", "x y.jpg"]);
  });

  it("tên rỗng thì có tên dự phòng", () => {
    expect(uniqueFileNames(["///"])).toEqual(["anh.jpg"]);
  });
});

describe("buildZip", () => {
  it("giải nén ra đúng các file và nội dung", async () => {
    const a = await jpeg(10, 10, "#f00");
    const b = await jpeg(10, 10, "#00f");
    const zip = buildZip([
      { name: "Eventhub - Ảnh 1.jpg", data: a },
      { name: "Eventhub - Ảnh 1.jpg", data: b },
    ]);
    const out = unzipSync(new Uint8Array(zip));
    expect(Object.keys(out).sort()).toEqual(["Eventhub - Ảnh 1 (2).jpg", "Eventhub - Ảnh 1.jpg"]);
    expect(Buffer.from(out["Eventhub - Ảnh 1.jpg"]).equals(a)).toBe(true);
  });
});

describe("buildPdf", () => {
  it("mỗi ảnh một trang, đúng tỉ lệ ảnh", async () => {
    const pdfBytes = await buildPdf([await jpeg(200, 300, "#0a0"), await jpeg(300, 150, "#a0a")], "Thử");
    expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(2);
    const p1 = doc.getPage(0).getSize();
    const p2 = doc.getPage(1).getSize();
    expect(p1.width).toBe(595);
    expect(p1.height).toBe(Math.round((300 / 200) * 595));
    expect(p2.height).toBe(Math.round((150 / 300) * 595));
  });
});
