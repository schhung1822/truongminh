import { QUALITY_TILE_CELLS } from "@/lib/image-options";

/**
 * Chế độ CHẤT LƯỢNG CAO (docs/DECISIONS.md D120). Ảnh catalog thường để AI vẽ 8-10 chất liệu trong một lần: mỗi logo chỉ
 * còn vài trăm điểm ảnh và AI phải bám 8-10 ảnh tham chiếu cùng lúc nên hay vẽ sai kiểu hàng khắc. Ở chế độ này AI vẽ từng
 * MẢNH 2 x 2 (tối đa 4 chất liệu, khung vuông), mỗi mảnh là một tác vụ AI riêng; tải về xong hệ thống ghép các mảnh theo
 * chiều dọc thành một ảnh 2 cột rồi mới vẽ đầu trang, nhãn, chú giải như ảnh thường. Với phần còn lại của hệ thống (chọn ô,
 * gửi Zalo, tải về, vẽ lại nhãn) đó vẫn là MỘT ảnh. File này chỉ có kiểu và phép tính thuần, kiểm thử được.
 */

/** Lưới của một mảnh AI vẽ, và tỉ lệ khung gửi cho AI. */
export const TILE_COLS = 2;
export const TILE_ROWS = 2;
export const TILE_ASPECT = "1:1";

/** Một mảnh của ảnh chất lượng cao, lưu trong cột generated_images.tiles (mảng theo thứ tự từ trên xuống). */
export type ImageTile = {
  /** vị trí ô đầu tiên của mảnh trong layoutSnapshot.cells (tính từ 0) và số ô của mảnh */
  from: number;
  count: number;
  /** prompt riêng của mảnh (lưới 2 x 2, ảnh tham chiếu đánh số lại từ đầu) */
  prompt: string;
  /** mã tác vụ ở nhà cung cấp; null = chưa gửi, hoặc lần gửi trước hỏng và cần gửi lại */
  taskId?: string | null;
  /** key ảnh gốc của mảnh đã tải về kho; có rồi thì mảnh này xong, không gọi AI lại nữa */
  path?: string | null;
  /** credits nhà cung cấp đã trừ cho mảnh (nếu có thông tin) */
  credits?: number | null;
};

/** Chia `count` ô thành các mảnh liên tiếp, mỗi mảnh tối đa 4 ô. */
export function planTiles(count: number): { from: number; count: number }[] {
  const out: { from: number; count: number }[] = [];
  for (let from = 0; from < count; from += QUALITY_TILE_CELLS) out.push({ from, count: Math.min(QUALITY_TILE_CELLS, count - from) });
  return out;
}

/** Lưới của ảnh sau khi ghép: luôn 2 cột, số hàng theo số chất liệu. */
export function stitchedGrid(count: number): { cols: number; rows: number } {
  return { cols: TILE_COLS, rows: Math.max(1, Math.ceil(count / TILE_COLS)) };
}

/** Số hàng thật sự có chất liệu của một mảnh (mảnh cuối có thể chỉ 1 hàng): phần còn lại bị cắt bỏ khi ghép. */
export function tileUsedRows(count: number): number {
  return Math.max(1, Math.min(TILE_ROWS, Math.ceil(count / TILE_COLS)));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Tỉ lệ khung "rộng:cao" của phần ảnh AI sau khi ghép (mỗi ô vuông, 2 cột), ví dụ 8 chất liệu -> "1:2".
 * Lưu vào generated_images.aspectRatio để giao diện đặt đúng vùng bấm lên từng ô (lib/imaging/geometry.ts).
 */
export function stitchedAspect(count: number): string {
  const { cols, rows } = stitchedGrid(count);
  const d = gcd(cols, rows);
  return `${cols / d}:${rows / d}`;
}

/** Đọc cột `tiles` (JSON bất kỳ). Trả null nếu đây là ảnh thường (không chia mảnh) hoặc dữ liệu không đúng dạng. */
export function readTiles(raw: unknown): ImageTile[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ImageTile[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const o = t as Record<string, unknown>;
    if (typeof o.from !== "number" || typeof o.count !== "number" || typeof o.prompt !== "string" || o.count < 1) return null;
    out.push({
      from: o.from,
      count: o.count,
      prompt: o.prompt,
      taskId: typeof o.taskId === "string" ? o.taskId : null,
      path: typeof o.path === "string" ? o.path : null,
      credits: typeof o.credits === "number" ? o.credits : null,
    });
  }
  return out;
}

/** Số tác vụ AI của một ảnh = số lượt tính vào hạn mức: ảnh thường 1, ảnh chất lượng cao bằng số mảnh. */
export function taskCount(tiles: unknown): number {
  return readTiles(tiles)?.length ?? 1;
}

/** Ghi chung prompt của các mảnh vào cột promptUsed để xem lại; AI nhận prompt riêng của từng mảnh. */
export function combinedPrompt(tiles: Pick<ImageTile, "from" | "count" | "prompt">[]): string {
  return tiles.map((t, i) => `[Mảnh ${i + 1}/${tiles.length}: ô ${t.from + 1} đến ${t.from + t.count}]\n${t.prompt}`).join("\n\n");
}
