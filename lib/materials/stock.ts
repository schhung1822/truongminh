/**
 * Thông số tấm của chất liệu (dùng để báo giá): hiển thị, đổi đơn vị chữ <-> số, tình trạng đủ/thiếu.
 * File này không import gì để dùng được cả ở trình duyệt lẫn máy chủ. Việc đọc và kiểm tra số người dùng gõ nằm ở stock-input.ts.
 *
 * Đơn vị lưu trữ: kích thước tấm, lề, khoảng cách tính bằng mm; giá bằng đồng. Form chất liệu nhập kích thước tấm bằng cm.
 */

export type StockSnapshot = {
  stockWidthMm: number | null;
  stockHeightMm: number | null;
  /** giá một tấm (đồng) */
  stockPrice: number | null;
  edgeMarginMm: number | null;
};

export type StockStatus = {
  /** có đủ rộng, cao, giá tấm và lề */
  complete: boolean;
  /** tên các thông số còn thiếu (chữ thường, để ghép vào câu) */
  missing: string[];
  /** "60 x 40 cm" khi có cả rộng lẫn cao, ngược lại null */
  sizeText: string | null;
};

/** Giá trị trong ô nhập của form thông số tấm (toàn chữ, để trống = chưa có dữ liệu). */
export type StockFormValues = {
  widthCm: string;
  heightCm: string;
  /** đồng */
  price: string;
  /** mm */
  edgeMarginMm: string;
  /** mm */
  gapMm: string;
  allowRotate: boolean;
};

export type StockFull = StockSnapshot & { gapMm: number | null; allowRotate: boolean };

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Số thập phân (Decimal của Prisma hoặc số thường) -> số; trống thì null. */
export function decimalToNumber(d: { toString(): string } | number | null | undefined): number | null {
  if (d === null || d === undefined) return null;
  const n = Number(d.toString());
  return Number.isFinite(n) ? n : null;
}

/** Làm tròn giá một tấm về 2 chữ số thập phân cho khớp cột trong CSDL (Decimal 14,2). */
export const roundPrice = (n: number): number => round(n, 2);

/** mm -> cm, làm tròn tối đa 4 chữ số thập phân, dạng chữ để điền vào ô nhập ("60", "59.9"). Trống thì "". */
export function mmToCmText(mm: number | null | undefined): string {
  if (mm == null || !Number.isFinite(mm)) return "";
  return String(round(mm / 10, 4));
}

/** Số thường dạng chữ để điền vào ô nhập (không dấu ngăn nghìn). Trống thì "". */
export function numberText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

/** "1.500.000" (dấu chấm ngăn nghìn, giữ phần lẻ nếu có), để xem trước số tiền người dùng đang gõ. */
export function formatDong(n: number): string {
  if (!Number.isFinite(n)) return "";
  const [int, frac] = String(round(n, 2)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac ? `${grouped},${frac}` : grouped;
}

/** Các thông số bắt buộc để tính giá: rộng, cao, giá tấm, lề. Khoảng cách trống thì dùng mặc định chung nên không tính là thiếu. */
export function describeStock(s: StockSnapshot): StockStatus {
  const missing: string[] = [];
  if (s.stockWidthMm == null) missing.push("rộng tấm");
  if (s.stockHeightMm == null) missing.push("cao tấm");
  if (s.stockPrice == null) missing.push("giá tấm");
  if (s.edgeMarginMm == null) missing.push("lề tấm");
  const sizeText = s.stockWidthMm != null && s.stockHeightMm != null ? `${mmToCmText(s.stockWidthMm)} x ${mmToCmText(s.stockHeightMm)} cm` : null;
  return { complete: missing.length === 0, missing, sizeText };
}

export function stockToForm(s: StockFull): StockFormValues {
  return {
    widthCm: mmToCmText(s.stockWidthMm),
    heightCm: mmToCmText(s.stockHeightMm),
    price: numberText(s.stockPrice),
    edgeMarginMm: numberText(s.edgeMarginMm),
    gapMm: numberText(s.gapMm),
    allowRotate: s.allowRotate,
  };
}
