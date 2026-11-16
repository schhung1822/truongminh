import sharp, { type OverlayOptions } from "sharp";
import { badgeRect, computeCells, computeLegend } from "@/lib/grid/layout";
import { renderText, renderTextFit, type TextImage } from "./text";

export type FinishCell = {
  code: string;
  name: string;
  /** loại chất liệu (nhóm) */
  groupName?: string;
  /** công nghệ in */
  printTech?: string;
};

export type FinishInput = {
  /** ảnh gốc AI trả về */
  original: Buffer;
  brandName: string;
  /** nhãn đứng sau tên thương hiệu ở đầu ảnh, ví dụ "Ảnh 1" */
  imageLabel?: string;
  cols: number;
  rows: number;
  cells: FinishCell[];
  labelMode: "overlay" | "legend" | "none";
  /** dòng chữ nhỏ ở chân ảnh, ví dụ "Xưởng in Trường Minh" */
  workshopName: string;
  /** dòng chú thích thêm dưới chân ảnh (để trống nếu không cần) */
  footerNote: string;
};

type Overlay = OverlayOptions;

/** Kích thước đầu/chân trang theo chiều rộng ảnh (px). Dùng chung với test. */
export function layoutMetrics(W: number, opts: { hasWorkshop: boolean; hasNote: boolean }) {
  const footerH = Math.round(W * (opts.hasNote ? 0.065 : opts.hasWorkshop ? 0.04 : 0.015));
  return { pad: Math.round(W * 0.04), headerH: Math.round(W * 0.075), footerH };
}

const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

/**
 * Thẻ nhãn nhỏ gọn đặt ở góc dưới PHẢI mỗi ô: [MÃ] Tên chất liệu / Loại · Công nghệ in.
 * Nền trắng mờ, viền mảnh, không có vạch nhấn; che rất ít phần sản phẩm.
 */
async function buildLabelCard(
  cell: { x: number; y: number; w: number; h: number },
  f: FinishCell,
  W: number,
  top: number,
): Promise<Overlay[]> {
  const m = Math.round(W * 0.008); // lề so với mép ô
  const padX = Math.round(W * 0.0065);
  const padY = Math.round(W * 0.0042);
  const accent = 0; // không còn vạch đen bên trái thẻ
  const gap = Math.round(W * 0.0048);
  const nameSize = Math.max(10, W * 0.0124);
  const smallSize = Math.max(8, W * 0.0092);
  const maxInner = cell.w - 2 * m - accent - 2 * padX;

  // dòng 1: chip mã + tên
  const codeImg = await renderTextFit({ text: f.code, size: smallSize, weight: "semibold", color: "#ffffff", maxWidth: Math.round(maxInner * 0.4) });
  const chipPadX = Math.round(smallSize * 0.55);
  const chipPadY = Math.round(smallSize * 0.28);
  const chipW = codeImg.width + 2 * chipPadX;
  const chipH = codeImg.height + 2 * chipPadY;
  const nameImg = await renderTextFit({ text: f.name, size: nameSize, weight: "semibold", color: "#141414", maxWidth: Math.max(20, maxInner - chipW - gap) });
  const line1H = Math.max(chipH, nameImg.height);
  const line1W = chipW + gap + nameImg.width;

  // dòng 2: loại chất liệu · công nghệ in
  const metaText = [f.groupName, f.printTech].filter((s): s is string => !!s && !!s.trim()).join("  ·  ");
  const meta: TextImage | null = metaText
    ? await renderTextFit({ text: metaText, size: smallSize, weight: "regular", color: "#5c5c5c", maxWidth: maxInner })
    : null;

  const innerW = Math.max(line1W, meta?.width ?? 0);
  const cardW = accent + padX + innerW + padX;
  const cardH = padY * 2 + line1H + (meta ? Math.round(gap * 0.7) + meta.height : 0);
  const x = cell.x + cell.w - cardW - m; // sát mép phải của ô
  const y = top + cell.y + cell.h - cardH - m;
  const r = Math.round(W * 0.0045);

  const out: Overlay[] = [
    {
      input: svg(
        cardW,
        cardH,
        `<rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}" rx="${r}" fill="#ffffff" fill-opacity="0.93" stroke="#000000" stroke-opacity="0.14"/>`,
      ),
      left: x,
      top: y,
    },
    {
      input: svg(chipW, chipH, `<rect width="${chipW}" height="${chipH}" rx="${Math.round(chipH * 0.28)}" fill="#1f1f1f"/>`),
      left: x + accent + padX,
      top: y + padY + Math.round((line1H - chipH) / 2),
    },
    { input: codeImg.input, left: x + accent + padX + chipPadX, top: y + padY + Math.round((line1H - chipH) / 2) + chipPadY },
    { input: nameImg.input, left: x + accent + padX + chipW + gap, top: y + padY + Math.round((line1H - nameImg.height) / 2) },
  ];
  if (meta) {
    out.push({ input: meta.input, left: x + accent + padX, top: y + padY + line1H + Math.round(gap * 0.7) });
  }
  return out;
}

/**
 * Hoàn thiện ảnh kết quả: đầu trang "Thương hiệu • Ảnh N", nhãn chất liệu (overlay hoặc legend),
 * chân trang một dòng chữ nhỏ. Xuất JPEG. Mọi kích thước tính theo chiều rộng ảnh.
 * Phần chữ này do HỆ THỐNG vẽ lên, không phải do AI vẽ.
 */
export async function finishImage(input: FinishInput): Promise<Buffer> {
  const base = sharp(input.original).rotate();
  const meta = await base.metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;
  const image = await base.flatten({ background: "#ffffff" }).png().toBuffer();

  const hasWorkshop = !!input.workshopName.trim();
  const hasNote = !!input.footerNote.trim();
  const { pad, headerH, footerH } = layoutMetrics(W, { hasWorkshop, hasNote });

  const overlays: Overlay[] = [];
  const cells = computeCells({ width: W, height: H, cols: input.cols, rows: input.rows, count: input.cells.length });

  // ---- Đầu trang: "Thương hiệu • Ảnh N" trên một dòng
  const labelText = input.imageLabel?.trim();
  const label = labelText ? await renderText({ text: labelText, size: W * 0.026, weight: "regular", color: "#7a7a7a" }) : null;
  const dotGap = Math.round(W * 0.012);
  const dot = label ? await renderText({ text: "•", size: W * 0.026, weight: "regular", color: "#b5b5b5" }) : null;
  const reserved = label && dot ? label.width + dot.width + dotGap * 2 : 0;
  const brand = await renderTextFit({
    text: input.brandName,
    size: W * 0.036,
    weight: "bold",
    color: "#141414",
    maxWidth: W - pad * 2 - reserved,
  });
  const lineH = Math.max(brand.height, label?.height ?? 0);
  const headerTop = Math.round((headerH - lineH) / 2);
  let hx = pad;
  overlays.push({ input: brand.input, left: hx, top: headerTop + Math.round((lineH - brand.height) / 2) });
  hx += brand.width;
  if (label && dot) {
    hx += dotGap;
    overlays.push({ input: dot.input, left: hx, top: headerTop + Math.round((lineH - dot.height) / 2) });
    hx += dot.width + dotGap;
    overlays.push({ input: label.input, left: hx, top: headerTop + Math.round((lineH - label.height) / 2) });
  }

  // ---- Nhãn trên ảnh
  const imageTop = headerH;
  if (input.labelMode === "overlay") {
    for (const cell of cells) {
      overlays.push(...(await buildLabelCard(cell, input.cells[cell.index], W, imageTop)));
    }
  }

  if (input.labelMode === "legend") {
    const badge = Math.max(18, Math.round(W * 0.04));
    for (const cell of cells) {
      const b = badgeRect(cell, badge, Math.round(badge * 0.3));
      overlays.push({
        input: svg(b.w, b.h, `<circle cx="${b.w / 2}" cy="${b.h / 2}" r="${b.w / 2}" fill="#000" fill-opacity="0.75"/>`),
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
        text: `${f.code} - ${f.name}${f.groupName ? ` (${f.groupName})` : ""}`,
        size,
        weight: "regular",
        color: "#333333",
        maxWidth: e.w - Math.round(W * 0.06),
      });
      overlays.push({ input: num.input, left: e.x, top: legendTop + e.y + Math.round((e.h - num.height) / 2) });
      overlays.push({ input: txt.input, left: e.x + Math.round(W * 0.05), top: legendTop + e.y + Math.round((e.h - txt.height) / 2) });
    }
  }

  // ---- Chân trang: một dòng nhỏ, kín đáo
  const totalH = headerH + H + legendH + footerH;
  const footerTop = headerH + H + legendH;
  const workshop = hasWorkshop
    ? await renderTextFit({ text: input.workshopName, size: W * 0.0155, weight: "regular", color: "#8a8a8a", maxWidth: W - pad * 2 })
    : null;
  const note = hasNote
    ? await renderTextFit({ text: input.footerNote, size: W * 0.0135, weight: "regular", color: "#9a9a9a", maxWidth: W - pad * 2 })
    : null;
  const noteGap = Math.round(W * 0.006);
  const block = (workshop?.height ?? 0) + (workshop && note ? noteGap : 0) + (note?.height ?? 0);
  let fy = footerTop + Math.round((footerH - block) / 2);
  if (workshop) {
    overlays.push({ input: workshop.input, left: Math.round((W - workshop.width) / 2), top: fy });
    fy += workshop.height + noteGap;
  }
  if (note) overlays.push({ input: note.input, left: Math.round((W - note.width) / 2), top: fy });

  // đường kẻ mảnh dưới đầu trang
  const line = (top: number) => ({ input: svg(W, 2, `<rect width="${W}" height="2" fill="#ececec"/>`), left: 0, top });

  return sharp({ create: { width: W, height: totalH, channels: 3, background: "#ffffff" } })
    .composite([{ input: image, left: 0, top: imageTop }, line(headerH - 2), ...overlays])
    .jpeg({ quality: 92 })
    .toBuffer();
}
