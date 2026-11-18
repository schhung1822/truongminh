import { describe, expect, it } from "vitest";
import { createLimiter } from "./async";
import {
  MAX_DEFER_MS,
  SUBMIT_MAX_PER_WINDOW,
  SUBMIT_WINDOW_MS,
  clearDeferred,
  newThrottleState,
  noteDeferred,
  noteRateLimited,
  reserveSubmitSlot,
} from "./throttle";

describe("reserveSubmitSlot", () => {
  it("cho gửi ngay đến hết suất trong cửa sổ, rồi bắt chờ tới khi suất đầu tiên hết hạn", () => {
    const st = newThrottleState();
    for (let i = 0; i < SUBMIT_MAX_PER_WINDOW; i++) expect(reserveSubmitSlot(st, 1_000 + i)).toBe(0);
    const wait = reserveSubmitSlot(st, 2_000);
    expect(wait).toBeGreaterThan(0);
    // suất đầu tiên ở mốc 1000 hết hạn sau 10s => chờ khoảng 9s (+ một chút đệm)
    expect(wait).toBeLessThanOrEqual(1_000 + SUBMIT_WINDOW_MS - 2_000 + 50);
    // chờ đủ rồi thì gửi được lại
    expect(reserveSubmitSlot(st, 1_000 + SUBMIT_WINDOW_MS + 100)).toBe(0);
  });

  it("không bao giờ vượt SUBMIT_MAX_PER_WINDOW trong bất kỳ cửa sổ nào", () => {
    const st = newThrottleState();
    const sent: number[] = [];
    // 60 ảnh cùng xin suất, cứ hỏi lại đúng lúc được hẹn
    let now = 0;
    let queue = 60;
    while (queue > 0) {
      const wait = reserveSubmitSlot(st, now);
      if (wait === 0) {
        sent.push(now);
        queue--;
      } else {
        now += wait;
      }
    }
    for (const t of sent) {
      const inWindow = sent.filter((x) => x >= t && x < t + SUBMIT_WINDOW_MS).length;
      expect(inWindow).toBeLessThanOrEqual(SUBMIT_MAX_PER_WINDOW);
    }
  });
});

describe("noteRateLimited", () => {
  it("chờ lâu dần 5s, 10s, 20s, 40s, rồi tối đa 60s", () => {
    const st = newThrottleState();
    const waits = [1, 2, 3, 4, 5, 6].map(() => noteRateLimited(st, "a", 0));
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it("làm cả hệ thống ngừng gửi một lúc (tối đa 15s)", () => {
    const st = newThrottleState();
    noteRateLimited(st, "a", 0);
    expect(reserveSubmitSlot(st, 1_000)).toBe(4_000);
    expect(reserveSubmitSlot(st, 5_000)).toBe(0);
    for (let i = 0; i < 6; i++) noteRateLimited(st, "b", 10_000);
    expect(reserveSubmitSlot(st, 10_000)).toBe(15_000);
  });
});

describe("noteDeferred", () => {
  it("báo quá hạn khi hoãn tổng cộng lâu hơn MAX_DEFER_MS, và xóa ghi chép thì tính lại từ đầu", () => {
    const st = newThrottleState();
    expect(noteDeferred(st, "a", 0)).toBe(false);
    expect(noteDeferred(st, "a", MAX_DEFER_MS - 1)).toBe(false);
    expect(noteDeferred(st, "a", MAX_DEFER_MS + 1)).toBe(true);
    clearDeferred(st, "a");
    expect(noteDeferred(st, "a", MAX_DEFER_MS + 2)).toBe(false);
  });
});

describe("createLimiter", () => {
  it("chỉ chạy tối đa max việc cùng lúc và vẫn chạy hết mọi việc", async () => {
    const run = createLimiter(3);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
          return i;
        }),
      ),
    );
    expect(peak).toBe(3);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("một việc lỗi không làm kẹt hàng đợi", async () => {
    const run = createLimiter(1);
    const a = run(async () => {
      throw new Error("lỗi");
    });
    const b = run(async () => "ok");
    await expect(a).rejects.toThrow("lỗi");
    await expect(b).resolves.toBe("ok");
  });
});
