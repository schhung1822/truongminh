/**
 * Tính vị trí các ô của một trang mẫu (lưới cột x hàng) và các vùng chữ chồng lên ảnh.
 * Toàn bộ là phép tính thuần, không phụ thuộc thư viện ảnh, để dễ kiểm thử.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Cell = Rect & { index: number; col: number; row: number };

/**
 * Chia ảnh rộng `width` x cao `height` thành cols x rows ô bằng nhau (đọc từ trái sang phải, trên xuống dưới)
 * rồi trả về `count` ô đầu tiên. Các ô lấp kín ảnh, không hở không chồng, kể cả khi chia không đều.
 */
export function computeCells(input: {
  width: number;
  height: number;
  cols: number;
  rows: number;
  count: number;
}): Cell[] {
  const { width, height, cols, rows, count } = input;
  if (cols < 1 || rows < 1) throw new Error("Số cột và số hàng phải lớn hơn 0.");
  if (count < 0 || count > cols * rows) throw new Error("Số ô vượt quá cột x hàng.");

  const cells: Cell[] = [];
  for (let index = 0; index < count; index++) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = Math.round((col * width) / cols);
    const y = Math.round((row * height) / rows);
    const x2 = Math.round(((col + 1) * width) / cols);
    const y2 = Math.round(((row + 1) * height) / rows);
    cells.push({ index, col, row, x, y, w: x2 - x, h: y2 - y });
  }
  return cells;
}

/** Dải nhãn nằm sát đáy ô (chế độ overlay): in "mã - tên" lên đây. */
export function labelStrip(cell: Rect, opts?: { heightRatio?: number; minHeight?: number }): Rect {
  const ratio = opts?.heightRatio ?? 0.085;
  const minH = opts?.minHeight ?? 14;
  const h = Math.min(cell.h, Math.max(minH, Math.round(cell.h * ratio)));
  return { x: cell.x, y: cell.y + cell.h - h, w: cell.w, h };
}

/** Huy hiệu số thứ tự ở góc trên trái ô (chế độ legend). */
export function badgeRect(cell: Rect, size: number, inset = 0): Rect {
  const s = Math.min(size, cell.w, cell.h);
  return { x: cell.x + inset, y: cell.y + inset, w: s, h: s };
}

export type LegendLayout = {
  height: number;
  columns: number;
  rowHeight: number;
  entries: (Rect & { index: number })[];
};

/**
 * Bảng chú giải đặt dưới ảnh (chế độ legend): `count` dòng xếp thành `columns` cột, đọc theo ĐÚNG thứ tự ô trên
 * ảnh (trái sang phải, trên xuống dưới, giống `computeCells`) chứ không lấp đầy cả cột trái rồi mới sang cột phải —
 * để số thứ tự trong chú giải nằm đúng vị trí tương ứng với số thứ tự trên ảnh khi `columns` khớp số cột của lưới
 * ảnh (xem D107). Chiều cao gồm cả đệm trên và dưới.
 */
export function computeLegend(input: {
  width: number;
  count: number;
  columns: number;
  rowHeight: number;
  padding: number;
}): LegendLayout {
  const { width, count, columns, rowHeight, padding } = input;
  if (count === 0) return { height: 0, columns, rowHeight, entries: [] };

  const rows = Math.ceil(count / columns);
  const colW = Math.floor((width - padding * 2) / columns);
  const entries = Array.from({ length: count }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return { index, x: padding + col * colW, y: padding + row * rowHeight, w: colW, h: rowHeight };
  });
  return { height: padding * 2 + rows * rowHeight, columns, rowHeight, entries };
}
