import { describe, expect, it } from "vitest";
import { addDays, isValidDay, listDays, parseRange } from "./range";

describe("ngày", () => {
  it("kiểm tra ngày có thật", () => {
    expect(isValidDay("2026-11-18")).toBe(true);
    expect(isValidDay("2026-02-31")).toBe(false);
    expect(isValidDay("18/11/2026")).toBe(false);
    expect(isValidDay("")).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });

  it("cộng trừ ngày qua tháng và năm", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("liệt kê ngày gồm cả hai đầu", () => {
    expect(listDays("2026-11-28", "2026-12-02")).toEqual(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(listDays("2026-11-18", "2026-11-18")).toEqual(["2026-11-18"]);
  });
});

describe("parseRange", () => {
  const today = "2026-11-18";

  it("mặc định 30 ngày gần nhất tính cả hôm nay", () => {
    const r = parseRange({}, today);
    expect(r.preset).toBe("30");
    expect(r.to).toBe(today);
    expect(r.days).toHaveLength(30);
    expect(r.from).toBe("2026-10-20");
  });

  it("các mốc nhanh 7, 90 và đầu tháng", () => {
    expect(parseRange({ preset: "7" }, today).days).toHaveLength(7);
    expect(parseRange({ preset: "90" }, today).days).toHaveLength(90);
    const m = parseRange({ preset: "month" }, today);
    expect(m.from).toBe("2026-11-01");
    expect(m.days).toHaveLength(18);
  });

  it("mốc lạ thì dùng mặc định", () => {
    expect(parseRange({ preset: "abc" }, today).preset).toBe("30");
  });

  it("from/to tự chọn được ưu tiên hơn mốc nhanh", () => {
    const r = parseRange({ preset: "7", from: "2026-11-01", to: "2026-11-05" }, today);
    expect(r).toMatchObject({ from: "2026-11-01", to: "2026-11-05", preset: "custom" });
    expect(r.days).toHaveLength(5);
  });

  it("đảo ngược nếu from > to; thiếu một đầu thì tự bù", () => {
    expect(parseRange({ from: "2026-11-10", to: "2026-11-05" }, today)).toMatchObject({ from: "2026-11-05", to: "2026-11-10" });
    expect(parseRange({ from: "2026-11-10" }, today)).toMatchObject({ from: "2026-11-10", to: today });
    expect(parseRange({ to: "2026-11-10" }, today).to).toBe("2026-11-10");
  });

  it("giới hạn tối đa 366 ngày", () => {
    const r = parseRange({ from: "2020-01-01", to: "2026-11-18" }, today);
    expect(r.days).toHaveLength(366);
    expect(r.to).toBe("2026-11-18");
  });

  it("ngày sai thì bỏ qua và dùng mốc nhanh", () => {
    expect(parseRange({ from: "hôm qua", to: "2026-13-45" }, today).preset).toBe("30");
  });
});
