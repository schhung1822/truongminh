/** Gom số liệu thống kê. Phép tính thuần, dữ liệu đầu vào là các dòng đã GROUP BY (ngày, người dùng, loại ảnh). */

export type UsageRow = {
  day: string;
  userId: string;
  kind: "SHEET" | "DESIGN";
  /** số lượt tạo (mỗi ảnh tạo hoặc tạo lại tính một lượt) */
  count: number;
  ok: number;
  failed: number;
  /** token kie.ai đã trừ */
  tokens: number;
};

export type DailyPoint = { day: string; total: number; sheet: number; design: number; tokens: number };

/** Mỗi ngày trong khoảng có đúng một điểm, ngày không có lượt nào thì toàn số 0. */
export function buildDaily(rows: UsageRow[], days: string[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>(days.map((day) => [day, { day, total: 0, sheet: 0, design: 0, tokens: 0 }]));
  for (const r of rows) {
    const p = map.get(r.day);
    if (!p) continue;
    p.total += r.count;
    if (r.kind === "SHEET") p.sheet += r.count;
    else p.design += r.count;
    p.tokens += r.tokens;
  }
  return days.map((d) => map.get(d)!);
}

export type UserTotals = { count: number; sheet: number; design: number; ok: number; failed: number; tokens: number; activeDays: number };

export function buildPerUser(rows: UsageRow[]): Map<string, UserTotals> {
  const out = new Map<string, UserTotals>();
  const daysByUser = new Map<string, Set<string>>();
  for (const r of rows) {
    const t = out.get(r.userId) ?? { count: 0, sheet: 0, design: 0, ok: 0, failed: 0, tokens: 0, activeDays: 0 };
    t.count += r.count;
    if (r.kind === "SHEET") t.sheet += r.count;
    else t.design += r.count;
    t.ok += r.ok;
    t.failed += r.failed;
    t.tokens += r.tokens;
    out.set(r.userId, t);
    const set = daysByUser.get(r.userId) ?? new Set<string>();
    set.add(r.day);
    daysByUser.set(r.userId, set);
  }
  for (const [id, t] of out) t.activeDays = daysByUser.get(id)!.size;
  return out;
}

export type Totals = { count: number; sheet: number; design: number; ok: number; failed: number; tokens: number; activeUsers: number };

export function buildTotals(rows: UsageRow[]): Totals {
  const users = new Set<string>();
  const t: Totals = { count: 0, sheet: 0, design: 0, ok: 0, failed: 0, tokens: 0, activeUsers: 0 };
  for (const r of rows) {
    t.count += r.count;
    if (r.kind === "SHEET") t.sheet += r.count;
    else t.design += r.count;
    t.ok += r.ok;
    t.failed += r.failed;
    t.tokens += r.tokens;
    users.add(r.userId);
  }
  t.activeUsers = users.size;
  return t;
}

/** Tỉ lệ thành công (%) trong số ảnh đã có kết quả; chưa có ảnh nào xong hoặc lỗi thì null. Ảnh đang tạo không tính. */
export function successRate(ok: number, failed: number): number | null {
  const done = ok + failed;
  return done === 0 ? null : Math.round((ok / done) * 1000) / 10;
}

/** Token trung bình mỗi ảnh đã xong; chưa có ảnh nào xong thì null. */
export function tokensPerImage(tokens: number, ok: number): number | null {
  return ok === 0 ? null : Math.round((tokens / ok) * 100) / 100;
}

/** Chọn các nhãn trục ngang sao cho không quá `max` nhãn: trả về chỉ số các ngày được ghi nhãn. */
export function pickLabelIndexes(length: number, max: number): number[] {
  if (length <= 0) return [];
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const step = Math.ceil(length / max);
  const out: number[] = [];
  for (let i = 0; i < length; i += step) out.push(i);
  return out;
}
