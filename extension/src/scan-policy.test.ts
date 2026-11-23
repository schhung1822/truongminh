import { describe, expect, it } from "vitest";
import { canSkipFullScan, hasReliableCoverage } from "./scan-policy";

describe("canSkipFullScan", () => {
  it("chỉ bỏ đọc sâu khi tổng không đổi và không tới lượt quét đầy đủ hằng ngày", () => {
    expect(canSkipFullScan({ reported_comment_count: 75, force_full_scan: false }, 75)).toBe(true);
    expect(canSkipFullScan({ reported_comment_count: 75, force_full_scan: false }, 76)).toBe(false);
    expect(canSkipFullScan({ reported_comment_count: null, force_full_scan: false }, 75)).toBe(false);
    expect(canSkipFullScan({ reported_comment_count: 75, force_full_scan: true }, 75)).toBe(false);
  });
});

describe("hasReliableCoverage", () => {
  it("không lưu mốc bỏ qua khi mới đọc được 10/75", () => {
    expect(hasReliableCoverage(10, 75)).toBe(false);
    expect(hasReliableCoverage(72, 75)).toBe(true);
    expect(hasReliableCoverage(0, null)).toBe(true);
  });
});
