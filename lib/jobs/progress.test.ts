import { describe, expect, it } from "vitest";
import { estimateProgress, expectedDurationMs, formatElapsed, overallProgress } from "./progress";

describe("estimateProgress", () => {
  const exp = 80_000;

  it("ảnh xong hoặc lỗi thì 100%", () => {
    expect(estimateProgress("SUCCESS", 5000, exp)).toBe(100);
    expect(estimateProgress("FAILED", 5000, exp)).toBe(100);
  });

  it("đang chờ gửi: nhích nhẹ nhưng không quá 8%", () => {
    expect(estimateProgress("PENDING", 0, exp)).toBe(0);
    expect(estimateProgress("PENDING", 2000, exp)).toBe(4);
    expect(estimateProgress("PENDING", 60_000, exp)).toBe(8);
  });

  it("đang tạo: bắt đầu từ 8%, tăng dần, không bao giờ vượt 95% khi chưa xong", () => {
    const start = estimateProgress("PROCESSING", 0, exp);
    const mid = estimateProgress("PROCESSING", 40_000, exp);
    const late = estimateProgress("PROCESSING", 200_000, exp);
    const forever = estimateProgress("PROCESSING", 10 * 3600_000, exp);
    expect(start).toBe(8);
    expect(mid).toBeGreaterThan(start);
    expect(late).toBeGreaterThan(mid);
    expect(forever).toBeLessThanOrEqual(95);
    expect(forever).toBeGreaterThan(94);
  });

  it("thời gian âm (lệch đồng hồ) không làm thanh lùi", () => {
    expect(estimateProgress("PROCESSING", -5000, exp)).toBe(8);
  });
});

describe("overallProgress", () => {
  it("trung bình và làm tròn; rỗng thì 0", () => {
    expect(overallProgress([100, 50, 0])).toBe(50);
    expect(overallProgress([100, 100, 33])).toBe(78);
    expect(overallProgress([])).toBe(0);
  });
});

describe("formatElapsed / expectedDurationMs", () => {
  it("định dạng phút:giây", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(83_000)).toBe("1:23");
    expect(formatElapsed(605_000)).toBe("10:05");
  });

  it("độ phân giải cao thì chờ lâu hơn", () => {
    expect(expectedDurationMs("1K")).toBeLessThan(expectedDurationMs("2K"));
    expect(expectedDurationMs("2K")).toBeLessThan(expectedDurationMs("4K"));
    expect(expectedDurationMs("8K")).toBe(expectedDurationMs("2K"));
  });
});
