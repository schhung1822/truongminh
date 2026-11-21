/**
 * Chọn bài cần quét cho extension (docs/thiet-ke-module-lead-facebook.md mục 7.2). Hàm thuần.
 *
 * Quy tắc: chỉ bài đang theo dõi của nick này; bài mới đăng (trong `freshHours` giờ) quét dày hơn (mỗi `pollMinutes`),
 * bài cũ quét thưa (mỗi `oldIntervalMinutes`); chưa quét lần nào thì đến lượt ngay; tối đa `maxPostsPerCycle` bài mỗi lần.
 */
export type SchedulePost = {
  id: string;
  postedAt: Date | null;
  createdAt: Date;
  lastScannedAt: Date | null;
  lastCommentAt: Date | null;
};

export type ScheduleConfig = {
  pollMinutes: number;
  freshHours: number;
  oldIntervalMinutes: number;
  maxPostsPerCycle: number;
  doneAfterDays: number;
};

const MIN = 60_000;

/** Mốc tính tuổi bài: ngày đăng nếu biết, không thì ngày đưa vào theo dõi. */
function age(p: SchedulePost, now: number): number {
  return now - (p.postedAt ?? p.createdAt).getTime();
}

export function isFresh(p: SchedulePost, now: number, cfg: Pick<ScheduleConfig, "freshHours">): boolean {
  return age(p, now) < cfg.freshHours * 60 * MIN;
}

export function isDue(p: SchedulePost, now: number, cfg: ScheduleConfig): boolean {
  if (!p.lastScannedAt) return true;
  const every = (isFresh(p, now, cfg) ? cfg.pollMinutes : cfg.oldIntervalMinutes) * MIN;
  return now - p.lastScannedAt.getTime() >= every;
}

/** Các bài đến lượt quét, đã xếp thứ tự ưu tiên và cắt theo giới hạn mỗi chu kỳ. */
export function pickPostsToScan<T extends SchedulePost>(posts: T[], now: number, cfg: ScheduleConfig, opts: { force?: boolean } = {}): T[] {
  return posts
    .filter((p) => opts.force || isDue(p, now, cfg)) // force = nhân sự bấm "Quét ngay": bỏ qua chu kỳ, vẫn giữ giới hạn số bài
    .sort((a, b) => {
      const neverA = a.lastScannedAt ? 1 : 0;
      const neverB = b.lastScannedAt ? 1 : 0;
      if (neverA !== neverB) return neverA - neverB; // chưa quét lần nào trước
      const freshA = isFresh(a, now, cfg) ? 0 : 1;
      const freshB = isFresh(b, now, cfg) ? 0 : 1;
      if (freshA !== freshB) return freshA - freshB; // bài mới trước bài cũ
      return (a.lastScannedAt?.getTime() ?? 0) - (b.lastScannedAt?.getTime() ?? 0); // quét lâu nhất trước
    })
    .slice(0, cfg.maxPostsPerCycle);
}

/**
 * Bài nên chuyển sang "Đã xong": đã được quét ít nhất một lần và quá `doneAfterDays` ngày không có comment mới
 * (tính từ comment mới nhất, không có thì từ ngày đăng / ngày đưa vào theo dõi).
 */
export function shouldMarkDone(p: SchedulePost, now: number, cfg: Pick<ScheduleConfig, "doneAfterDays">): boolean {
  if (!p.lastScannedAt) return false;
  const last = (p.lastCommentAt ?? p.postedAt ?? p.createdAt).getTime();
  return now - last >= cfg.doneAfterDays * 24 * 60 * MIN;
}
