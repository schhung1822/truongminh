/** Khoảng ngày cho trang Thống kê. Mọi ngày là chuỗi "YYYY-MM-DD" theo múi giờ cấu hình (APP_TIMEZONE). */

export const MAX_RANGE_DAYS = 366;
export const DEFAULT_PRESET = "30";

export type StatsRange = {
  from: string;
  to: string;
  /** mọi ngày trong khoảng, tăng dần, gồm cả hai đầu */
  days: string[];
  /** tên gọi của mốc đã chọn, để tô sáng nút lọc nhanh ("7", "30", "90", "month" hoặc "custom") */
  preset: "7" | "30" | "90" | "month" | "custom";
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDay(day: string | undefined | null): day is string {
  if (!day || !DAY_RE.test(day)) return false;
  return fromUtc(toUtc(day)) === day; // chặn ngày không có thật như 2026-02-31
}

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

/** Danh sách ngày từ `from` đến `to` (gồm cả hai đầu). */
export function listDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ms = toUtc(from); ms <= toUtc(to); ms += DAY_MS) out.push(fromUtc(ms));
  return out;
}

/**
 * Đọc khoảng ngày từ tham số trên đường dẫn. Ưu tiên from/to tự chọn; không có thì dùng mốc nhanh
 * (7, 30, 90 ngày gần nhất hoặc "month" = từ đầu tháng này). `today` là ngày hôm nay theo múi giờ cấu hình.
 */
export function parseRange(
  params: { preset?: string; from?: string; to?: string },
  today: string,
): StatsRange {
  if (isValidDay(params.from) || isValidDay(params.to)) {
    let to = isValidDay(params.to) ? params.to : today;
    let from = isValidDay(params.from) ? params.from : addDays(to, -29);
    if (from > to) [from, to] = [to, from];
    if (listDays(from, to).length > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
    return { from, to, days: listDays(from, to), preset: "custom" };
  }

  const preset = (["7", "30", "90", "month"] as const).find((p) => p === params.preset) ?? DEFAULT_PRESET;
  const from = preset === "month" ? `${today.slice(0, 8)}01` : addDays(today, -(Number(preset) - 1));
  return { from, to: today, days: listDays(from, today), preset };
}
