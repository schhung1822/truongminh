import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("cho qua tới giới hạn rồi chặn kèm số giây nên chờ", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(rl.hit("a", 0).ok).toBe(true);
    expect(rl.hit("a", 1000).ok).toBe(true);
    expect(rl.hit("a", 2000).ok).toBe(true);
    const r = rl.hit("a", 3000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBe(57); // lần gọi đầu hết hạn ở giây 60
  });

  it("hết cửa sổ thì cho gọi lại", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).ok).toBe(true);
    expect(rl.hit("a", 500).ok).toBe(false);
    expect(rl.hit("a", 1000).ok).toBe(true);
  });

  it("mỗi khoá đếm riêng", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(rl.hit("a", 0).ok).toBe(true);
    expect(rl.hit("b", 0).ok).toBe(true);
    expect(rl.hit("a", 1).ok).toBe(false);
  });

  it("lần bị chặn không kéo dài thời gian chờ", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    rl.hit("a", 0);
    rl.hit("a", 400);
    rl.hit("a", 800);
    expect(rl.hit("a", 1000).ok).toBe(true);
  });
});
