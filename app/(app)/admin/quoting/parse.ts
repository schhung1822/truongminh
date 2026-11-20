import { parseNumberInput } from "@/lib/quoting/schemas";
import { cmToMm } from "./format";

/**
 * Đọc số admin gõ vào ô nhập (thuần, có test). Ô trống = null = "chưa có dữ liệu"; gõ sai = "invalid".
 * Việc đổi sang số cuối cùng luôn đi qua parseNumberInput của lib/quoting (dấu phẩy thập phân kiểu Việt).
 */

export type Parsed = number | null | "invalid";

/** Chỉ nhận dạng "12", "12,5", "12.5", ",5": loại "1e5", "0x10", "12abc", "1,5,2". */
const STRICT = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;
/** "1.500", "12.345.678": dấu chấm là dấu ngăn nghìn. Nhóm đầu không bắt đầu bằng 0 ("0.500" là 0,5, không phải 500). */
const THOUSANDS = /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/;

/** Số thường (tốc độ, mm, %, phút...). "1,5" và "1.5" đều là 1,5; không có dấu ngăn nghìn. */
export function parsePlain(v: unknown): Parsed {
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    if (!STRICT.test(s)) return "invalid";
    return parseNumberInput(s);
  }
  return parseNumberInput(v);
}

/**
 * Số lớn (tiền đồng, mm2, tổng chiều dài cắt): dấu chấm kiểu "1.500.000" là dấu ngăn nghìn, dấu phẩy là thập phân.
 * "1.5" (không đúng nhóm 3 chữ số) vẫn hiểu là 1,5. Chấp nhận hậu tố đ, ₫, vnd.
 */
export function parseGrouped(v: unknown): Parsed {
  if (typeof v !== "string") return parseNumberInput(v);
  const s = v.trim().replace(/\s+/g, "").replace(/(₫|đ|vnđ|vnd)$/i, "");
  if (s === "") return null;
  if (s.includes(",")) {
    if (s.indexOf(",") !== s.lastIndexOf(",")) return "invalid";
    const [int, frac] = s.split(",");
    if (int.includes(".") && !THOUSANDS.test(int)) return "invalid";
    return parsePlain(`${int.replace(/\./g, "")}.${frac}`);
  }
  if (THOUSANDS.test(s)) return parsePlain(s.replace(/\./g, ""));
  return parsePlain(s);
}

/** Số cm gõ vào → mm để lưu (làm tròn 4 chữ số thập phân). */
export function parseCmToMm(v: unknown): Parsed {
  const n = parsePlain(v);
  return typeof n === "number" ? cmToMm(n) : n;
}
