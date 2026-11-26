import sharp from "sharp";
import { TILE_ROWS, tileUsedRows } from "@/lib/jobs/tiles";

/**
 * Ghép các mảnh 2 x 2 của một ảnh chất lượng cao (D120) theo chiều dọc thành MỘT ảnh 2 cột, mảnh đầu ở trên cùng.
 * Mọi mảnh được đưa về cùng kích thước vuông (theo mảnh đầu) để các ô thẳng hàng tuyệt đối: phần vẽ nhãn và vùng bấm chọn ô
 * phía sau coi ảnh ghép là một lưới đều. Mảnh cuối chỉ có 1-2 chất liệu thì AI vẫn vẽ khung vuông (hàng dưới để trống),
 * ở đây cắt bỏ hàng trống đó. Trả về PNG (không nén mất chi tiết) để vẽ ảnh hoàn thiện.
 */
export async function stitchTiles(tiles: { buffer: Buffer; count: number }[]): Promise<Buffer> {
  if (tiles.length === 0) throw new Error("Không có mảnh nào để ghép.");
  const first = await sharp(tiles[0].buffer).metadata();
  const side = Math.min(first.width ?? 0, first.height ?? 0);
  if (side <= 0) throw new Error("Không đọc được kích thước mảnh ảnh.");
  // cạnh chia hết cho số hàng của mảnh để mọi ô cao bằng nhau tới từng điểm ảnh
  const size = side - (side % TILE_ROWS);
  const rowH = size / TILE_ROWS;

  const parts: { input: Buffer; left: number; top: number }[] = [];
  let top = 0;
  for (const t of tiles) {
    const h = rowH * tileUsedRows(t.count);
    const input = await sharp(t.buffer)
      .resize({ width: size, height: size, fit: "fill" })
      .extract({ left: 0, top: 0, width: size, height: h })
      .png()
      .toBuffer();
    parts.push({ input, left: 0, top });
    top += h;
  }
  return sharp({ create: { width: size, height: top, channels: 3, background: "#ffffff" } }).composite(parts).png().toBuffer();
}
