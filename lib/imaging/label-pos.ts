/**
 * Kiểu và vị trí nhãn chất liệu trên ảnh. Dùng chung cho máy chủ (vẽ ảnh) và giao diện (chọn),
 * nên file này không được import thư viện nặng như sharp.
 */

/**
 * Kiểu nhãn:
 * - overlay: thẻ đầy đủ "[mã] tên / loại · công nghệ in" trong mỗi ô
 * - compact: thẻ gọn, hẹp (tối đa 40% bề rộng ô), tên xuống dòng; hợp với nhãn dài che logo
 * - legend: chỉ đánh số nhỏ trên ô, tên đầy đủ ở bảng chú giải dưới ảnh (không che ảnh)
 * - none: không ghi nhãn
 */
export const LABEL_STYLES = ["overlay", "compact", "legend", "none"] as const;
export type LabelStyle = (typeof LABEL_STYLES)[number];

export const LABEL_STYLE_TEXT: Record<LabelStyle, string> = {
  overlay: "Thẻ đầy đủ",
  compact: "Thẻ gọn",
  legend: "Đánh số + chú giải",
  none: "Ẩn nhãn",
};

export const LABEL_STYLE_HINT: Record<LabelStyle, string> = {
  overlay: "Mã và tên trên một dòng, rộng bằng nội dung",
  compact: "Thẻ hẹp, tên xuống dòng, ít che logo",
  legend: "Số nhỏ trên ô, tên ghi ở bảng dưới ảnh",
  none: "Ảnh sạch, không chữ trên ô",
};

export function isLabelStyle(v: unknown): v is LabelStyle {
  return typeof v === "string" && (LABEL_STYLES as readonly string[]).includes(v);
}

/** Kiểu nhãn có thẻ trong ô, nên mới có vị trí để chọn. */
export function styleHasPosition(style: LabelStyle): boolean {
  return style === "overlay" || style === "compact";
}

/** Vị trí thẻ nhãn trong MỖI ô: hàng (t = trên, b = dưới) rồi cột (l = trái, c = giữa, r = phải). */
export const LABEL_POSITIONS = ["tl", "tc", "tr", "bl", "bc", "br"] as const;
export type LabelPos = (typeof LABEL_POSITIONS)[number];

/** Vị trí mặc định (góc dưới phải, như trước đây). */
export const DEFAULT_LABEL_POS: LabelPos = "br";

export const LABEL_POS_TEXT: Record<LabelPos, string> = {
  tl: "Trên trái",
  tc: "Trên giữa",
  tr: "Trên phải",
  bl: "Dưới trái",
  bc: "Dưới giữa",
  br: "Dưới phải",
};

export function isLabelPos(v: unknown): v is LabelPos {
  return typeof v === "string" && (LABEL_POSITIONS as readonly string[]).includes(v);
}

/** Tọa độ góc trên trái của thẻ nhãn trong một ô: `cell` là ô (x, y, w, h), `card` là kích thước thẻ, `m` là lề. */
export function labelCardOrigin(
  pos: LabelPos,
  cell: { x: number; y: number; w: number; h: number },
  card: { w: number; h: number },
  m: number,
): { x: number; y: number } {
  const col = pos[1]; // l | c | r
  const row = pos[0]; // t | b
  const x = col === "l" ? cell.x + m : col === "c" ? cell.x + Math.round((cell.w - card.w) / 2) : cell.x + cell.w - card.w - m;
  const y = row === "t" ? cell.y + m : cell.y + cell.h - card.h - m;
  return { x, y };
}
