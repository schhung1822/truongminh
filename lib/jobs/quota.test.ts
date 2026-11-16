import { describe, expect, it } from "vitest";
import { checkQuota, remainingQuota } from "./quota";

describe("hạn mức ngày", () => {
  it("tính số lượt còn lại, không âm", () => {
    expect(remainingQuota(60, 10)).toBe(50);
    expect(remainingQuota(60, 60)).toBe(0);
    expect(remainingQuota(60, 80)).toBe(0);
  });

  it("cho phép khi đủ lượt, kể cả dùng vừa khít", () => {
    expect(checkQuota(60, 50, 10)).toBeNull();
    expect(checkQuota(60, 0, 1)).toBeNull();
  });

  it("chặn khi hết lượt, báo rõ", () => {
    expect(checkQuota(60, 60, 1)).toMatch(/hết 60 lượt/);
  });

  it("chặn khi cần nhiều hơn số còn lại, nêu số còn lại và số cần", () => {
    expect(checkQuota(60, 55, 10)).toMatch(/còn 5 lượt.*cần 10/);
  });

  it("hạn mức 0 là khóa hoàn toàn", () => {
    expect(checkQuota(0, 0, 1)).not.toBeNull();
  });
});
