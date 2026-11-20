import { parseNumberInput } from "@/lib/quoting/schemas";

/** Đọc số người dùng gõ trong form thông số tấm (thuần). Việc kiểm tra khoảng giá trị do materialStockSchema (lib/quoting/schemas) làm. */

/** Chữ hoặc số (cm) -> mm, làm tròn tối đa 4 chữ số thập phân. Trống = null (chưa có dữ liệu); không phải số = "invalid". */
export function cmToMm(input: unknown): number | null | "invalid" {
  const n = parseNumberInput(input);
  if (n === null || n === "invalid") return n;
  return Math.round(n * 10 * 1e4) / 1e4;
}
