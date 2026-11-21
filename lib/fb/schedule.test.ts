import { describe, expect, it } from "vitest";
import { isDue, isFresh, pickPostsToScan, shouldMarkDone, type ScheduleConfig, type SchedulePost } from "./schedule";

const H = 3600_000;
const M = 60_000;
const NOW = Date.UTC(2026, 10, 21, 3, 0, 0);
const ago = (ms: number) => new Date(NOW - ms);

const cfg: ScheduleConfig = { pollMinutes: 10, freshHours: 48, oldIntervalMinutes: 60, maxPostsPerCycle: 3, doneAfterDays: 7 };

const post = (id: string, o: Partial<SchedulePost> = {}): SchedulePost => ({
  id,
  postedAt: ago(1 * H),
  createdAt: ago(1 * H),
  lastScannedAt: null,
  lastCommentAt: null,
  ...o,
});

describe("isFresh / isDue", () => {
  it("bài mới đăng trong 48 giờ là bài mới, theo ngày đăng", () => {
    expect(isFresh(post("a", { postedAt: ago(47 * H) }), NOW, cfg)).toBe(true);
    expect(isFresh(post("a", { postedAt: ago(49 * H) }), NOW, cfg)).toBe(false);
  });

  it("không biết ngày đăng thì tính theo ngày đưa vào theo dõi", () => {
    expect(isFresh(post("a", { postedAt: null, createdAt: ago(5 * H) }), NOW, cfg)).toBe(true);
    expect(isFresh(post("a", { postedAt: null, createdAt: ago(100 * H) }), NOW, cfg)).toBe(false);
  });

  it("chưa quét lần nào thì đến lượt ngay", () => {
    expect(isDue(post("a"), NOW, cfg)).toBe(true);
  });

  it("bài mới: đủ 10 phút mới quét lại", () => {
    expect(isDue(post("a", { lastScannedAt: ago(9 * M) }), NOW, cfg)).toBe(false);
    expect(isDue(post("a", { lastScannedAt: ago(10 * M) }), NOW, cfg)).toBe(true);
  });

  it("bài cũ: đủ 60 phút mới quét lại", () => {
    const old = { postedAt: ago(100 * H), createdAt: ago(100 * H) };
    expect(isDue(post("a", { ...old, lastScannedAt: ago(30 * M) }), NOW, cfg)).toBe(false);
    expect(isDue(post("a", { ...old, lastScannedAt: ago(60 * M) }), NOW, cfg)).toBe(true);
  });
});

describe("pickPostsToScan", () => {
  it("bỏ bài chưa đến lượt", () => {
    const picks = pickPostsToScan([post("a", { lastScannedAt: ago(1 * M) }), post("b")], NOW, cfg);
    expect(picks.map((p) => p.id)).toEqual(["b"]);
  });

  it("ưu tiên: chưa quét lần nào, rồi bài mới, rồi bài quét lâu nhất", () => {
    const old = { postedAt: ago(100 * H), createdAt: ago(100 * H) };
    const picks = pickPostsToScan(
      [
        post("old-late", { ...old, lastScannedAt: ago(2 * H) }),
        post("fresh-recent", { lastScannedAt: ago(20 * M) }),
        post("fresh-longest", { lastScannedAt: ago(50 * M) }),
        post("never-old", { ...old }),
      ],
      NOW,
      { ...cfg, maxPostsPerCycle: 10 },
    );
    expect(picks.map((p) => p.id)).toEqual(["never-old", "fresh-longest", "fresh-recent", "old-late"]);
  });

  it("cắt theo số bài tối đa mỗi chu kỳ", () => {
    const posts = ["a", "b", "c", "d", "e"].map((id) => post(id));
    expect(pickPostsToScan(posts, NOW, cfg)).toHaveLength(3);
  });

  it("danh sách rỗng thì rỗng", () => {
    expect(pickPostsToScan([], NOW, cfg)).toEqual([]);
  });
});

describe("shouldMarkDone", () => {
  it("chưa quét lần nào thì chưa kết thúc", () => {
    expect(shouldMarkDone(post("a", { postedAt: ago(30 * 24 * H), createdAt: ago(30 * 24 * H) }), NOW, cfg)).toBe(false);
  });

  it("quá 7 ngày không có comment mới (tính từ comment mới nhất) thì kết thúc", () => {
    const base = { postedAt: ago(30 * 24 * H), createdAt: ago(30 * 24 * H), lastScannedAt: ago(1 * H) };
    expect(shouldMarkDone(post("a", { ...base, lastCommentAt: ago(8 * 24 * H) }), NOW, cfg)).toBe(true);
    expect(shouldMarkDone(post("a", { ...base, lastCommentAt: ago(6 * 24 * H) }), NOW, cfg)).toBe(false);
  });

  it("chưa có comment nào thì tính từ ngày đăng", () => {
    expect(shouldMarkDone(post("a", { postedAt: ago(8 * 24 * H), lastScannedAt: ago(1 * H) }), NOW, cfg)).toBe(true);
    expect(shouldMarkDone(post("a", { postedAt: ago(2 * 24 * H), lastScannedAt: ago(1 * H) }), NOW, cfg)).toBe(false);
  });
});

describe("pickPostsToScan: force (bấm Quét ngay)", () => {
  it("bỏ qua chu kỳ nhưng vẫn giữ giới hạn số bài", () => {
    const posts = ["a", "b", "c", "d"].map((id) => post(id, { lastScannedAt: ago(1 * M) }));
    expect(pickPostsToScan(posts, NOW, cfg)).toEqual([]);
    expect(pickPostsToScan(posts, NOW, cfg, { force: true })).toHaveLength(3);
  });
});
