/**
 * Giới hạn tần suất theo khoá (mã kết nối hoặc địa chỉ IP), cửa sổ trượt, lưu trong bộ nhớ.
 * Web chạy một tiến trình duy nhất (PM2 instances: 1) nên không cần kho dùng chung; khởi động lại là xóa sạch.
 */
export type RateLimiter = {
  /** Ghi nhận một lần gọi. ok=false nghĩa là đã quá giới hạn, retryAfterSec là số giây nên chờ. */
  hit(key: string, now?: number): { ok: true } | { ok: false; retryAfterSec: number };
};

export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  return {
    hit(key, now = Date.now()) {
      // thỉnh thoảng dọn các khoá đã im lâu để Map không phình mãi
      if (now - lastSweep > opts.windowMs) {
        lastSweep = now;
        for (const [k, list] of hits) if (list.every((t) => now - t >= opts.windowMs)) hits.delete(k);
      }
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        const oldest = recent[0];
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
