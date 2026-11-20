/**
 * Định dạng và đổi đơn vị cho trang thiết lập báo giá. Thuần (không import gì), dùng được ở cả máy chủ lẫn trình duyệt.
 * Cơ sở dữ liệu lưu mm; giao diện admin hiển thị tấm bằng cm, lề và khoảng cách bằng mm, giá bằng đồng.
 */

/** Làm tròn tối đa 4 chữ số thập phân để không sinh sai số kiểu 59.99999 khi đổi cm sang mm và ngược lại. */
export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export const cmToMm = (cm: number): number => round4(cm * 10);
export const mmToCm = (mm: number): number => round4(mm / 10);

/** Số → chữ để điền vào ô nhập: dấu phẩy thập phân kiểu Việt, không có dấu ngăn nghìn, bỏ số 0 thừa. Rỗng nếu không có số. */
export function numToText(n: number | null | undefined, maxDecimals = 8): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const t = n.toFixed(maxDecimals);
  const trimmed = t.includes(".") ? t.replace(/\.?0+$/, "") : t;
  const out = trimmed === "-0" || trimmed === "" ? "0" : trimmed;
  return out.replace(".", ",");
}

/** Số → chữ để hiển thị: dấu chấm ngăn nghìn, dấu phẩy thập phân (ví dụ 1500000 → "1.500.000", 1.5 → "1,5"). */
export function groupDigits(n: number | null | undefined, maxDecimals = 4): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const plain = numToText(n, maxDecimals); // "-1234,5"
  const neg = plain.startsWith("-");
  const [int, frac] = (neg ? plain.slice(1) : plain).split(",");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${grouped}${frac ? `,${frac}` : ""}`;
}

export const NO_DATA = "Chưa có dữ liệu";

/** Tiền đồng để hiển thị, ví dụ "1.500.000 đ". Không có số thì "Chưa có dữ liệu". */
export function formatVnd(n: number | null | undefined): string {
  return n === null || n === undefined ? NO_DATA : `${groupDigits(n, 2)} đ`;
}

/** Số hiển thị kèm đơn vị, hoặc "Chưa có dữ liệu". */
export function withUnit(n: number | null | undefined, unit: string, maxDecimals = 4): string {
  return n === null || n === undefined ? NO_DATA : `${groupDigits(n, maxDecimals)} ${unit}`;
}

/** Giờ Việt Nam, ví dụ "20/11/2026, 14:05". Nhận Date hoặc chuỗi ISO (Date không đi qua ranh giới máy chủ → trình duyệt được). */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
