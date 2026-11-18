import { describe, expect, it } from "vitest";
import { buildDaily, buildPerUser, buildTotals, pickLabelIndexes, successRate, tokensPerImage, type UsageRow } from "./aggregate";

const rows: UsageRow[] = [
  { day: "2026-11-16", userId: "a", kind: "SHEET", count: 3, ok: 2, failed: 1, tokens: 20 },
  { day: "2026-11-16", userId: "b", kind: "DESIGN", count: 4, ok: 4, failed: 0, tokens: 40 },
  { day: "2026-11-18", userId: "a", kind: "DESIGN", count: 2, ok: 1, failed: 0, tokens: 10 },
  { day: "2026-11-30", userId: "a", kind: "SHEET", count: 9, ok: 9, failed: 0, tokens: 90 }, // ngoài khoảng, phải bỏ qua
];
const days = ["2026-11-16", "2026-11-17", "2026-11-18"];

describe("buildDaily", () => {
  it("mỗi ngày một điểm, ngày trống là 0, gộp theo loại ảnh", () => {
    const d = buildDaily(rows, days);
    expect(d.map((x) => x.day)).toEqual(days);
    expect(d[0]).toEqual({ day: "2026-11-16", total: 7, sheet: 3, design: 4, tokens: 60 });
    expect(d[1]).toEqual({ day: "2026-11-17", total: 0, sheet: 0, design: 0, tokens: 0 });
    expect(d[2]).toMatchObject({ total: 2, design: 2, tokens: 10 });
  });

  it("bỏ qua dòng nằm ngoài khoảng ngày", () => {
    expect(buildDaily(rows, days).reduce((s, x) => s + x.total, 0)).toBe(9);
  });
});

describe("buildPerUser", () => {
  it("cộng dồn theo người và đếm số ngày có hoạt động", () => {
    const m = buildPerUser(rows.slice(0, 3));
    expect(m.get("a")).toEqual({ count: 5, sheet: 3, design: 2, ok: 3, failed: 1, tokens: 30, activeDays: 2 });
    expect(m.get("b")).toMatchObject({ count: 4, design: 4, activeDays: 1 });
    expect(m.has("c")).toBe(false);
  });
});

describe("buildTotals", () => {
  it("tổng toàn khoảng và số người có hoạt động", () => {
    expect(buildTotals(rows.slice(0, 3))).toEqual({ count: 9, sheet: 3, design: 6, ok: 7, failed: 1, tokens: 70, activeUsers: 2 });
    expect(buildTotals([])).toEqual({ count: 0, sheet: 0, design: 0, ok: 0, failed: 0, tokens: 0, activeUsers: 0 });
  });
});

describe("tỉ lệ và trung bình", () => {
  it("tỉ lệ thành công làm tròn 1 số lẻ, không chia cho 0", () => {
    expect(successRate(7, 1)).toBe(87.5);
    expect(successRate(2, 1)).toBe(66.7);
    expect(successRate(0, 0)).toBeNull();
    expect(successRate(0, 3)).toBe(0);
  });

  it("token trung bình mỗi ảnh xong", () => {
    expect(tokensPerImage(70, 7)).toBe(10);
    expect(tokensPerImage(0, 0)).toBeNull();
    expect(tokensPerImage(10, 3)).toBe(3.33);
  });
});

describe("pickLabelIndexes", () => {
  it("ít ngày thì ghi nhãn tất cả", () => {
    expect(pickLabelIndexes(5, 8)).toEqual([0, 1, 2, 3, 4]);
  });

  it("nhiều ngày thì thưa ra, không quá số nhãn tối đa và luôn có ngày đầu", () => {
    const idx = pickLabelIndexes(30, 8);
    expect(idx.length).toBeLessThanOrEqual(8);
    expect(idx[0]).toBe(0);
    expect(pickLabelIndexes(0, 8)).toEqual([]);
  });
});
