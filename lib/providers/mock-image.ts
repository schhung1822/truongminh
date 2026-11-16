import sharp from "sharp";
import { computeCells } from "@/lib/grid/layout";

const PALETTE = [
  "#e8c4c4",
  "#c4d8e8",
  "#d4e8c4",
  "#e8dcc4",
  "#d8c4e8",
  "#c4e8e0",
  "#e8c4dc",
  "#cfd3d8",
  "#e8d4b0",
  "#b8c8d8",
  "#d0e0b8",
  "#e0b8b8",
  "#b8e0d8",
  "#e0c8e8",
  "#c8c8e8",
  "#e8e8b8",
];

/**
 * Ảnh giả cho MockProvider: lưới cột x hàng, mỗi ô một màu pastel với "logo" giả ở giữa,
 * khe trắng mảnh giữa các ô giống ảnh AI thật. Các ô sau `count` để trắng.
 */
export async function generateMockImage(input: {
  width: number;
  height: number;
  cols: number;
  rows: number;
  count: number;
  seed: number;
}): Promise<Buffer> {
  const { width, height, cols, rows, count, seed } = input;
  const gutter = Math.max(2, Math.round(width * 0.006));
  const cells = computeCells({ width, height, cols, rows, count: Math.min(count, cols * rows) });

  const shapes = cells
    .map((c) => {
      const x = c.x + gutter / 2;
      const y = c.y + gutter / 2;
      const w = c.w - gutter;
      const h = c.h - gutter;
      const color = PALETTE[(c.index + seed) % PALETTE.length];
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.16;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>
        <circle cx="${cx}" cy="${cy - r * 0.35}" r="${r}" fill="#1f3a5f" fill-opacity="0.85"/>
        <rect x="${cx - r * 1.5}" y="${cy + r * 0.95}" width="${r * 3}" height="${r * 0.42}" rx="${r * 0.2}" fill="#1f3a5f" fill-opacity="0.85"/>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#ffffff"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
