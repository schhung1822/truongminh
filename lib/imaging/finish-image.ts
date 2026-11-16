import sharp, { type OverlayOptions } from "sharp";
import { badgeRect, computeCells, computeLegend, labelStrip } from "@/lib/grid/layout";
import { renderText, renderTextFit } from "./text";

export type FinishCell = { code: string; name: string };

export type FinishInput = {
  /** ảnh gốc AI trả về */
  original: Buffer;
  brandName: string;
  /** tên trang mẫu (hoặc tên chất liệu với ảnh thiết kế) hiện dưới tên thương hiệu */
  title: string;
  cols: number;
  rows: number;
  cells: FinishCell[];
  labelMode: "overlay" | "legend" | "none";
  workshopName: string;
  footerNote: string;
};

type Overlay = OverlayOptions;

/**
 * Hoàn thiện ảnh kết quả: thêm đầu trang (thương hiệu + tên trang), nhãn chất liệu
 * (overlay hoặc legend) và chân trang (tên xưởng + chú thích). Xuất JPEG.
 * Mọi kích thước tính theo chiều rộng ảnh nên ảnh 1K, 2K, 4K đều cân đối.
 */
export async function finishImage(input: FinishInput): Promise<Buffer> {
  const base = sharp(input.original).rotate();
  const meta = await base.metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;
  const image = await base.flatten({ background: "#ffffff" }).png().toBuffer();

  const pad = Math.round(W * 0.04);
  const headerH = Math.round(W * 0.115);
  const footerH = Math.round(W * 0.1);

  const overlays: Overlay[] = [];
  const cells = computeCells({ width: W, height: H, cols: input.cols, rows: input.rows, count: input.cells.length });

  // ---- Đầu trang
  const brand = await renderTextFit({
    text: input.brandName,
    size: W * 0.04,
    weight: "bold",
    color: "#1a1a1a",
    maxWidth: W - pad * 2,
  });
  const title = await renderTextFit({
    text: input.title,
    size: W * 0.025,
    weight: "regular",
    color: "#555555",
    maxWidth: W - pad * 2,
  });
  const headerGap = Math.round(W * 0.008);
  const headerBlock = brand.height + headerGap + title.height;
  const headerTop = Math.round((headerH - headerBlock) / 2);
  overlays.push({ input: brand.input, left: pad, top: headerTop });
  overlays.push({ input: title.input, left: pad, top: headerTop + brand.height + headerGap });

  // ---- Nhãn trên ảnh
  const imageTop = headerH;
  if (input.labelMode === "overlay") {
    const fontSize = Math.max(9, W * 0.0165);
    for (const cell of cells) {
      const strip = labelStrip(cell, { heightRatio: 0.075, minHeight: Math.round(fontSize * 1.9) });
      overlays.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${strip.w}" height="${strip.h}"><rect width="${strip.w}" height="${strip.h}" fill="#000" fill-opacity="0.62"/></svg>`,
        ),
        left: strip.x,
        top: imageTop + strip.y,
      });
      const f = input.cells[cell.index];
      const label = await renderTextFit({
        text: `${f.code} - ${f.name}`,
        size: fontSize,
        weight: "semibold",
        color: "#ffffff",
        maxWidth: strip.w - Math.round(fontSize),
      });
      overlays.push({
        input: label.input,
        left: strip.x + Math.round((strip.w - label.width) / 2),
        top: imageTop + strip.y + Math.round((strip.h - label.height) / 2),
      });
    }
  }

  if (input.labelMode === "legend") {
    const badge = Math.max(18, Math.round(W * 0.04));
    for (const cell of cells) {
      const b = badgeRect(cell, badge, Math.round(badge * 0.3));
      overlays.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}"><circle cx="${b.w / 2}" cy="${b.h / 2}" r="${b.w / 2}" fill="#000" fill-opacity="0.75"/></svg>`,
        ),
        left: b.x,
        top: imageTop + b.y,
      });
      const num = await renderText({ text: String(cell.index + 1), size: b.w * 0.5, weight: "bold", color: "#ffffff" });
      overlays.push({
        input: num.input,
        left: b.x + Math.round((b.w - num.width) / 2),
        top: imageTop + b.y + Math.round((b.h - num.height) / 2),
      });
    }
  }

  // ---- Bảng chú giải dưới ảnh (legend)
  let legendH = 0;
  if (input.labelMode === "legend" && input.cells.length > 0) {
    const rowHeight = Math.round(W * 0.042);
    const legend = computeLegend({
      width: W,
      count: input.cells.length,
      columns: input.cells.length > 4 ? 2 : 1,
      rowHeight,
      padding: pad,
    });
    legendH = legend.height;
    const legendTop = imageTop + H;
    const size = W * 0.02;
    for (const e of legend.entries) {
      const f = input.cells[e.index];
      const num = await renderText({ text: `${e.index + 1}.`, size, weight: "bold", color: "#1a1a1a" });
      const txt = await renderTextFit({
        text: `${f.code} - ${f.name}`,
        size,
        weight: "regular",
        color: "#333333",
        maxWidth: e.w - Math.round(W * 0.06),
      });
      const y = legendTop + e.y + Math.round((e.h - num.height) / 2);
      overlays.push({ input: num.input, left: e.x, top: y });
      overlays.push({ input: txt.input, left: e.x + Math.round(W * 0.05), top: legendTop + e.y + Math.round((e.h - txt.height) / 2) });
    }
  }

  // ---- Chân trang
  const totalH = headerH + H + legendH + footerH;
  const footerTop = headerH + H + legendH;
  const workshop = await renderTextFit({
    text: input.workshopName,
    size: W * 0.026,
    weight: "semibold",
    color: "#1a1a1a",
    maxWidth: W - pad * 2,
  });
  const note = await renderTextFit({
    text: input.footerNote,
    size: W * 0.0185,
    weight: "regular",
    color: "#666666",
    maxWidth: W - pad * 2,
  });
  const footerGap = Math.round(W * 0.008);
  const footerBlock = (input.workshopName.trim() ? workshop.height + footerGap : 0) + (input.footerNote.trim() ? note.height : 0);
  let fy = footerTop + Math.round((footerH - footerBlock) / 2);
  if (input.workshopName.trim()) {
    overlays.push({ input: workshop.input, left: Math.round((W - workshop.width) / 2), top: fy });
    fy += workshop.height + footerGap;
  }
  if (input.footerNote.trim()) {
    overlays.push({ input: note.input, left: Math.round((W - note.width) / 2), top: fy });
  }

  // đường kẻ mảnh ngăn đầu trang và chân trang với ảnh
  const line = (top: number) => ({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="2"><rect width="${W}" height="2" fill="#e3e3e3"/></svg>`,
    ),
    left: 0,
    top,
  });

  return sharp({ create: { width: W, height: totalH, channels: 3, background: "#ffffff" } })
    .composite([{ input: image, left: 0, top: imageTop }, line(headerH - 2), line(footerTop), ...overlays])
    .jpeg({ quality: 92 })
    .toBuffer();
}
