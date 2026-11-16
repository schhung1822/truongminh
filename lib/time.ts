/** Chênh lệch (ms) giữa giờ ở múi giờ `timeZone` và UTC tại thời điểm `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** 0 giờ 0 phút của ngày "YYYY-MM-DD" ở múi giờ chỉ định, đổi ra thời điểm UTC. Sai định dạng thì trả null. */
export function zonedStartOfDay(dateStr: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(guess)) return null;
  return new Date(guess - tzOffsetMs(new Date(guess), timeZone));
}

/** Trả về ngày dạng YYYY-MM-DD theo múi giờ chỉ định (dùng tính hạn mức theo ngày). */
export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA cho dạng YYYY-MM-DD
}
