/**
 * Độ dày chất liệu và quy ước của xưởng:
 * - Mỏng: 0.2 - 0.4 mm. Chỉ cắt được, không khắc được.
 * - Cao thành: 0.5 - 0.9 mm. Cắt được; khắc được họa tiết không quá lớn vì dễ bị muội đen.
 * - Dày: 1.0 - 1.3 mm. Cắt, khắc thoải mái.
 * Số đo thật nằm giữa các khoảng (ví dụ 0.47 hay 0.95) thì xếp vào nhóm gần nhất: mốc chia là 0.45 và 0.95.
 * File này không import gì để dùng được cả ở trình duyệt lẫn máy chủ.
 */
export type ThicknessClass = {
  key: "thin" | "mid" | "thick";
  label: string;
  range: string;
  /** Làm được gì với độ dày này */
  rule: string;
};

export const THICKNESS_CLASSES: ThicknessClass[] = [
  { key: "thin", label: "Mỏng", range: "0.2 - 0.4 mm", rule: "Chỉ cắt được, không khắc được." },
  { key: "mid", label: "Cao thành", range: "0.5 - 0.9 mm", rule: "Cắt được; khắc họa tiết không quá lớn vì dễ bị muội đen." },
  { key: "thick", label: "Dày", range: "1.0 - 1.3 mm", rule: "Cắt, khắc thoải mái." },
];

export const MAX_THICKNESS_MM = 10;

/** Nhóm độ dày của một số đo (mm). Không có số đo (null, NaN, <= 0) thì trả null. */
export function thicknessClass(mm: number | null | undefined): ThicknessClass | null {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return null;
  if (mm < 0.45) return THICKNESS_CLASSES[0];
  if (mm < 0.95) return THICKNESS_CLASSES[1];
  return THICKNESS_CLASSES[2];
}

/** "0.51 mm" (bỏ số 0 thừa ở cuối: 0.5 -> "0.5 mm", 1 -> "1 mm"). */
export function formatThickness(mm: number | null | undefined): string {
  if (mm == null || !Number.isFinite(mm)) return "";
  return `${Number(mm.toFixed(2))} mm`;
}

/**
 * Đọc độ dày người dùng gõ: chấp nhận "0.51", "0,51", "0.51mm", "0,5 mm". Trống thì null.
 * Số không hợp lệ thì trả undefined để nơi gọi báo lỗi.
 */
export function parseThickness(input: string | null | undefined): number | null | undefined {
  const s = (input ?? "").trim().toLowerCase().replace(/\s*mm$/, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  if (!(n > 0) || n > MAX_THICKNESS_MM) return undefined;
  return Math.round(n * 100) / 100;
}
