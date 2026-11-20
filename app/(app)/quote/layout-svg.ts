import type { Placement } from "@/lib/nesting";
import { fmtCm } from "./format";

/**
 * Xuất bố cục xếp logo ra SVG (thuần, chạy được ở trình duyệt lẫn máy chủ).
 * Đơn vị của SVG là mm, tỉ lệ 1:1 so với tấm thật. Đây chỉ là hình ước tính để báo giá, KHÔNG phải file sản xuất.
 */

export const SVG_NOTE = "Bố cục ước tính để báo giá, không phải file sản xuất";

export type QuoteLayoutStock = { widthMm: number; heightMm: number; edgeMarginMm: number; gapMm: number };

export type QuoteLayout = {
  stock: QuoteLayoutStock;
  placements: Placement[];
  /** tên phương án xếp, ví dụ "Lưới thẳng 9 x 6" */
  label?: string;
};

/** Thoát ký tự đặc biệt của XML để tiêu đề do người dùng nhập không phá được SVG. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); // ký tự điều khiển không hợp lệ trong XML 1.0
}

const r2 = (n: number): string => String(Math.round(n * 100) / 100);
const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

export function layoutToSvg(layout: QuoteLayout, opts?: { title?: string }): string {
  const W = Math.max(1, finite(layout.stock.widthMm, 1));
  const H = Math.max(1, finite(layout.stock.heightMm, 1));
  const margin = Math.max(0, finite(layout.stock.edgeMarginMm));
  const gap = Math.max(0, finite(layout.stock.gapMm));
  const items = layout.placements.filter((p) => [p.x, p.y, p.width, p.height].every((v) => Number.isFinite(v)));
  const title = (opts?.title ?? "").trim() || "Bố cục xếp logo trên tấm";

  const big = Math.max(W, H);
  const fs = Math.max(3, Math.min(big / 40, 24)); // cỡ chữ (mm)
  const sw = Math.max(0.3, big / 800); // nét vẽ (mm)
  const pad = fs;
  const headerH = fs * 3.4;
  const footerH = fs * 5;
  const vw = W + pad * 2;
  const vh = H + pad * 2 + headerH + footerH;
  const ox = pad;
  const oy = pad + headerH;

  const straight = items.filter((p) => p.rotation !== 90).length;
  const rotated = items.length - straight;
  const sub = [
    `Tấm ${fmtCm(W)} x ${fmtCm(H)} cm`,
    `lề ${fmtCm(margin)} cm`,
    `khoảng cách ${fmtCm(gap)} cm`,
    `${items.length} logo`,
    ...(layout.label ? [layout.label] : []),
  ].join(" · ");

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${r2(vw)}mm" height="${r2(vh)}mm" viewBox="0 0 ${r2(vw)} ${r2(vh)}" font-family="Arial, Helvetica, sans-serif">`);
  out.push(`<title>${escapeXml(title)}</title>`);
  out.push(`<rect x="0" y="0" width="${r2(vw)}" height="${r2(vh)}" fill="#ffffff"/>`);
  out.push(`<text x="${r2(pad)}" y="${r2(pad + fs)}" font-size="${r2(fs)}" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`);
  out.push(`<text x="${r2(pad)}" y="${r2(pad + fs * 2.4)}" font-size="${r2(fs * 0.8)}" fill="#374151">${escapeXml(sub)}</text>`);

  out.push(`<g transform="translate(${r2(ox)} ${r2(oy)})">`);
  out.push(`<rect data-role="stock" x="0" y="0" width="${r2(W)}" height="${r2(H)}" fill="#fafafa" stroke="#111827" stroke-width="${r2(sw)}"/>`);
  if (margin > 0 && W - margin * 2 > 0 && H - margin * 2 > 0) {
    out.push(
      `<rect data-role="margin" x="${r2(margin)}" y="${r2(margin)}" width="${r2(W - margin * 2)}" height="${r2(H - margin * 2)}" fill="none" stroke="#9ca3af" stroke-width="${r2(sw)}" stroke-dasharray="${r2(sw * 4)} ${r2(sw * 3)}"/>`,
    );
  }
  items.forEach((p, i) => {
    const isRot = p.rotation === 90;
    const fill = isRot ? "#ffedd5" : "#dbeafe";
    const stroke = isRot ? "#ea580c" : "#2563eb";
    const nfs = Math.max(1, Math.min(fs, Math.min(p.width, p.height) * 0.4));
    out.push(
      `<g><rect data-logo="${i + 1}" data-rotation="${isRot ? 90 : 0}" x="${r2(p.x)}" y="${r2(p.y)}" width="${r2(p.width)}" height="${r2(p.height)}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw * 0.8)}"/>` +
        `<text x="${r2(p.x + p.width / 2)}" y="${r2(p.y + p.height / 2 + nfs * 0.35)}" font-size="${r2(nfs)}" text-anchor="middle" fill="#1f2937">${i + 1}</text></g>`,
    );
  });
  out.push(`</g>`);

  const fy = oy + H + pad + fs;
  out.push(`<text x="${r2(pad)}" y="${r2(fy)}" font-size="${r2(fs * 0.9)}" font-weight="bold" fill="#b91c1c">${escapeXml(SVG_NOTE)}</text>`);
  out.push(
    `<text x="${r2(pad)}" y="${r2(fy + fs * 1.3)}" font-size="${r2(fs * 0.75)}" fill="#374151">${escapeXml(
      `Ô xanh: xếp thẳng (${straight}) · Ô cam: xoay 90° (${rotated}) · Nét đứt: vùng lề tấm`,
    )}</text>`,
  );
  out.push(`<text x="${r2(pad)}" y="${r2(fy + fs * 2.4)}" font-size="${r2(fs * 0.75)}" fill="#374151">${escapeXml("Đơn vị mm, tỉ lệ 1:1; gốc ở góc trên-trái của tấm.")}</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}
