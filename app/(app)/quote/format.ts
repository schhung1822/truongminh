/**
 * Hàm thuần dùng chung cho công cụ báo giá: định dạng số/tiền, đổi đơn vị cm <-> mm, đọc ô nhập của sale.
 * Không tự tính giá: giá luôn đến từ máy chủ.
 */

/** Bỏ dấu tiếng Việt và chữ hoa, dùng để tìm kiếm không phân biệt dấu. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Số nguyên có dấu chấm ngăn nghìn: 1234567 -> "1.234.567". */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n);
  const s = groupThousands(Math.abs(r).toString());
  return r < 0 ? `-${s}` : s;
}

/** Tiền VND: "1.234.567 đ". */
export const fmtVnd = (n: number): string => `${fmtInt(n)} đ`;

/** Số thập phân kiểu Việt: dấu phẩy thập phân, dấu chấm ngăn nghìn. */
export function fmtDec(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const [intPart, frac] = n.toFixed(digits).split(".");
  const neg = intPart.startsWith("-");
  const body = groupThousands(neg ? intPart.slice(1) : intPart);
  return `${neg ? "-" : ""}${body}${frac ? `,${frac}` : ""}`;
}

/** Phần trăm với 1 chữ số thập phân: "78,5%". */
export const fmtPct = (n: number): string => `${fmtDec(n, 1)}%`;

/** mm -> cm để hiển thị, tối đa 1 chữ số thập phân ("5", "4,8"); fixed = luôn 1 chữ số ("5,0"). */
export function fmtCm(mm: number, fixed = false): string {
  if (!Number.isFinite(mm)) return "—";
  const text = fmtDec(Math.round(mm) / 10, 1);
  return fixed ? text : text.replace(/,0$/, "");
}

/** mm -> chuỗi cm cho ô nhập (tối đa 2 chữ số thập phân, bỏ số 0 thừa) để điền lại đúng kích thước gợi ý. */
export function cmFieldFromMm(mm: number): string {
  if (!Number.isFinite(mm)) return "";
  return String(Math.round(mm * 10) / 100).replace(".", ",");
}

/** Đọc số thập phân sale gõ (chấp nhận dấu phẩy hoặc chấm); không hợp lệ thì null. */
export function parseDecimal(text: string): number | null {
  const t = text.trim();
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** cm -> mm, làm tròn tới 0,1 mm. */
export const cmToMm = (cm: number): number => Math.round(cm * 100) / 10;

export const MAX_CUSTOM_QUANTITIES = 6;

/** Đọc danh sách số lượng tùy chọn ("10, 75 1.000"): bỏ trùng, sắp tăng dần, kiểm tra khoảng hợp lệ. */
export function parseQuantityList(text: string, max = MAX_CUSTOM_QUANTITIES): { values: number[]; error: string | null } {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const values: number[] = [];
  for (const raw of tokens) {
    const t = raw.replace(/\./g, ""); // dấu chấm là ngăn nghìn kiểu Việt
    if (!/^\d+$/.test(t)) return { values: [], error: `"${raw}" không phải số lượng hợp lệ. Nhập số nguyên, cách nhau bằng dấu cách hoặc dấu phẩy.` };
    const n = Number(t);
    if (!Number.isSafeInteger(n) || n < 1 || n > 10_000_000) return { values: [], error: "Số lượng phải từ 1 đến 10.000.000." };
    if (!values.includes(n)) values.push(n);
  }
  if (values.length > max) return { values: [], error: `Tối đa ${max} số lượng tùy chọn.` };
  return { values: values.sort((a, b) => a - b), error: null };
}

/** Gộp nhiều danh sách số lượng thành một danh sách tăng dần, không trùng. */
export function unionQuantities(lists: number[][]): number[] {
  return [...new Set(lists.flat())].sort((a, b) => a - b);
}

/** Câu gợi ý đổi kích thước (so với kết quả đang xem để con số "thay vì" luôn khớp bảng). */
export function suggestionText(current: { widthMm: number; perSheet: number }, s: { widthMm: number; perSheet: number }): string {
  const down = s.widthMm < current.widthMm;
  const gain = current.perSheet > 0 ? Math.round(((s.perSheet - current.perSheet) * 100) / current.perSheet) : 0;
  return `Nếu ${down ? "giảm" : "tăng"} logo từ ${fmtCm(current.widthMm, true)} cm ${down ? "xuống" : "lên"} ${fmtCm(s.widthMm, true)} cm có thể xếp ${s.perSheet} logo/tấm (+${gain}%) thay vì ${current.perSheet}`;
}

export type QuoteStatusValue = "DRAFT" | "SENT" | "WON";
export const QUOTE_STATUSES: QuoteStatusValue[] = ["DRAFT", "SENT", "WON"];
export const QUOTE_STATUS_LABEL: Record<QuoteStatusValue, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi khách",
  WON: "Khách chốt",
};
export const isQuoteStatus = (v: unknown): v is QuoteStatusValue => v === "DRAFT" || v === "SENT" || v === "WON";

/** Tên tệp an toàn cho tệp tải về (bỏ dấu, chỉ chữ số và gạch nối). */
export function safeFileName(base: string, ext: string): string {
  const slug = fold(base)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "bao-gia"}.${ext}`;
}
