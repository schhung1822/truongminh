import { fold } from "./phone";

/**
 * Đổi chuỗi thời gian tương đối của Facebook ("2 giờ", "3 ngày", "Vừa xong", "5m", "1 week") ra thời điểm ước chừng,
 * tính lùi từ `now`. Chỉ là ước chừng (Facebook làm tròn), nên chuỗi gốc vẫn được lưu riêng. Không hiểu thì trả null.
 */
const UNIT_SECONDS: Record<string, number> = {
  giay: 1, s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  phut: 60, p: 60, m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  gio: 3600, g: 3600, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  ngay: 86400, d: 86400, day: 86400, days: 86400,
  tuan: 604800, w: 604800, wk: 604800, wks: 604800, week: 604800, weeks: 604800,
  thang: 30 * 86400, mo: 30 * 86400, month: 30 * 86400, months: 30 * 86400,
  nam: 365 * 86400, y: 365 * 86400, yr: 365 * 86400, yrs: 365 * 86400, year: 365 * 86400, years: 365 * 86400,
};

export function parseRelativeTime(text: string | null | undefined, now: Date): Date | null {
  if (!text) return null;
  const t = fold(text).trim();
  if (!t) return null;
  if (/\b(vua xong|just now|now)\b/.test(t)) return new Date(now);
  if (/\b(hom qua|yesterday)\b/.test(t)) return new Date(now.getTime() - 86400_000);

  // Phải là cả chuỗi dạng "<số> <đơn vị>" (có thể kèm "trước"/"ago"): ngày tháng đầy đủ như "20 tháng 11, 2026" không được hiểu nhầm
  const m = /^(\d+)\s*([a-z]+)(?:\s+(?:truoc|ago))?$/.exec(t);
  if (!m) return null;
  const secs = UNIT_SECONDS[m[2]];
  if (!secs) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n > 1000) return null;
  return new Date(now.getTime() - n * secs * 1000);
}
