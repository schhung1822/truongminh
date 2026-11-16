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
