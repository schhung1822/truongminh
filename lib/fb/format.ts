/** Định dạng ngày giờ kiểu Việt Nam, múi giờ cố định Asia/Ho_Chi_Minh (dùng được cả ở server lẫn trình duyệt). */
const DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : DATE_TIME.format(d);
}

/** "5 phút trước", "2 giờ trước", "3 ngày trước"; chưa từng thì "chưa". */
export function fmtAgo(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return "chưa";
  const t = (typeof value === "string" ? new Date(value) : value).getTime();
  if (Number.isNaN(t)) return "chưa";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}
