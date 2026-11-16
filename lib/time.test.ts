import { describe, expect, it } from "vitest";
import { dayKey } from "./time";

describe("dayKey", () => {
  it("tính ngày theo múi giờ Việt Nam, không theo UTC", () => {
    // 17:30 UTC ngày 15 = 00:30 ngày 16 giờ Việt Nam
    expect(dayKey(new Date("2026-11-15T17:30:00Z"), "Asia/Ho_Chi_Minh")).toBe("2026-11-16");
    expect(dayKey(new Date("2026-11-15T16:59:59Z"), "Asia/Ho_Chi_Minh")).toBe("2026-11-15");
  });

  it("reset đúng nửa đêm địa phương", () => {
    const before = dayKey(new Date("2026-12-31T16:59:59Z"), "Asia/Ho_Chi_Minh");
    const after = dayKey(new Date("2026-12-31T17:00:00Z"), "Asia/Ho_Chi_Minh");
    expect(before).toBe("2026-12-31");
    expect(after).toBe("2027-01-01");
  });
});
