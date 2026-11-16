import { describe, expect, it } from "vitest";
import { clearFailures, isLocked, recordFailure } from "./rate-limit";

describe("rate-limit đăng nhập", () => {
  it("khóa sau 5 lần sai và mở lại sau 15 phút", () => {
    const k = "a@x.com";
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) recordFailure(k, t0 + i);
    expect(isLocked(k, t0 + 10)).toBe(false);
    recordFailure(k, t0 + 5);
    expect(isLocked(k, t0 + 10)).toBe(true);
    expect(isLocked(k, t0 + 15 * 60 * 1000 + 10)).toBe(false);
  });

  it("đăng nhập đúng thì xóa bộ đếm", () => {
    const k = "b@x.com";
    for (let i = 0; i < 5; i++) recordFailure(k, 1);
    clearFailures(k);
    expect(isLocked(k, 2)).toBe(false);
  });
});
