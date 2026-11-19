/** Giờ làm việc của xưởng (thuần, có test): đang trong giờ hay ngoài giờ theo múi giờ cấu hình. */

export type WorkingHours = {
  /** "08:00" */
  start: string;
  /** "17:30" */
  end: string;
  /** 0 = Chủ nhật ... 6 = Thứ bảy */
  days: number[];
};

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Lúc `now` có nằm trong giờ làm việc không. Giờ kết thúc nhỏ hơn giờ bắt đầu (ví dụ 18:00-02:00) hiểu là ca qua đêm;
 * ngày làm việc tính theo ngày bắt đầu ca. Bằng nhau hiểu là cả ngày.
 */
export function isWithinHours(now: Date, timeZone: string, h: WorkingHours): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = WEEKDAYS[get("weekday")];
  const cur = Number(get("hour")) * 60 + Number(get("minute"));
  const start = minutes(h.start);
  const end = minutes(h.end);

  if (start === end) return h.days.includes(day);
  if (start < end) return h.days.includes(day) && cur >= start && cur < end;
  // ca qua đêm
  if (cur >= start) return h.days.includes(day);
  if (cur < end) return h.days.includes((day + 6) % 7);
  return false;
}

export const WEEKDAY_LABELS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"] as const;

/** Mô tả giờ làm việc cho AI và người đọc: "Thứ hai, Thứ ba ... từ 08:00 đến 17:30". */
export function describeHours(h: WorkingHours): string {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => h.days.includes(d));
  const days = order.length === 7 ? "Mọi ngày" : order.map((d) => WEEKDAY_LABELS[d]).join(", ");
  return `${days}, từ ${h.start} đến ${h.end}`;
}
