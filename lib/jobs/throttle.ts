/**
 * Giữ nhịp gửi tác vụ sang nhà cung cấp (kie.ai) cho CẢ HỆ THỐNG, không chỉ từng phiên.
 *
 * kie.ai giới hạn theo tài khoản: tối đa 20 yêu cầu tạo ảnh mới / 10 giây và khoảng 100 tác vụ chạy cùng lúc;
 * vượt thì trả 429 và KHÔNG xếp hàng giúp. Nhiều sale bấm cùng lúc rất dễ vượt, nên ta tự xếp hàng ở đây:
 * ảnh chưa tới lượt thì giữ nguyên trạng thái PENDING và hẹn giờ gửi lại, không tốn lượt thử lại, không tốn hạn mức.
 *
 * Trạng thái nằm trong bộ nhớ (hệ thống chạy một bản app duy nhất) và gắn vào globalThis để các nhóm mã
 * của Next (trang, route, action) cùng thấy một bộ đếm.
 */
import { createLimiter, type Limiter } from "./async";

/** Dưới mức 20/10s của kie.ai một chút để chừa chỗ cho lệch giờ. */
export const SUBMIT_MAX_PER_WINDOW = 15;
export const SUBMIT_WINDOW_MS = 10_000;
/** Dưới mức ~100 tác vụ chạy cùng lúc của kie.ai. */
export const MAX_ACTIVE_TASKS = 80;
/** Một ảnh bị hoãn (xếp hàng hoặc bị 429) tổng cộng quá lâu thì báo lỗi để sale bấm Tạo lại. */
export const MAX_DEFER_MS = 10 * 60_000;
/** Chờ khi đang đủ số tác vụ chạy cùng lúc. */
export const ACTIVE_CAP_WAIT_MS = 5_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
/** Sau khi bị 429, cả hệ thống ngừng gửi trong ngần này (tối đa) để kie.ai hồi lại. */
const GLOBAL_COOLDOWN_MAX_MS = 15_000;

export type ThrottleState = {
  /** thời điểm (ms) các lần gửi gần đây, dùng cho cửa sổ trượt */
  submitTimes: number[];
  /** cả hệ thống tạm ngừng gửi tới mốc này (sau khi bị 429) */
  blockedUntil: number;
  /** ảnh đang bị hoãn: bắt đầu hoãn từ lúc nào, đã bị 429 mấy lần */
  deferred: Map<string, { since: number; hits: number }>;
};

export function newThrottleState(): ThrottleState {
  return { submitTimes: [], blockedUntil: 0, deferred: new Map() };
}

/**
 * Xin một suất gửi. Trả 0 = được gửi ngay (suất đã được giữ chỗ). Trả số ms > 0 = chưa tới lượt, hãy hẹn gửi lại sau ngần đó.
 */
export function reserveSubmitSlot(st: ThrottleState, now = Date.now()): number {
  if (now < st.blockedUntil) return st.blockedUntil - now;
  st.submitTimes = st.submitTimes.filter((t) => now - t < SUBMIT_WINDOW_MS);
  if (st.submitTimes.length >= SUBMIT_MAX_PER_WINDOW) {
    return st.submitTimes[0] + SUBMIT_WINDOW_MS - now + 50;
  }
  st.submitTimes.push(now);
  return 0;
}

/** Ghi nhận ảnh bị hoãn. Trả true nếu đã hoãn quá lâu (nên báo lỗi thay vì chờ tiếp). */
export function noteDeferred(st: ThrottleState, imageId: string, now = Date.now()): boolean {
  const cur = st.deferred.get(imageId);
  if (!cur) {
    st.deferred.set(imageId, { since: now, hits: 0 });
    return false;
  }
  return now - cur.since > MAX_DEFER_MS;
}

/**
 * kie.ai vừa trả 429 cho ảnh này. Cả hệ thống tạm ngừng gửi một lúc, ảnh này chờ lâu dần theo số lần bị 429
 * (5s, 10s, 20s, 40s, rồi 60s). Trả số ms nên chờ trước khi gửi lại.
 */
export function noteRateLimited(st: ThrottleState, imageId: string, now = Date.now()): number {
  const cur = st.deferred.get(imageId) ?? { since: now, hits: 0 };
  cur.hits += 1;
  st.deferred.set(imageId, cur);
  const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (cur.hits - 1));
  st.blockedUntil = Math.max(st.blockedUntil, now + Math.min(backoff, GLOBAL_COOLDOWN_MAX_MS));
  return backoff;
}

/** Ảnh đã gửi được hoặc đã kết thúc: bỏ ghi chép hoãn. */
export function clearDeferred(st: ThrottleState, imageId: string): void {
  st.deferred.delete(imageId);
}

// ---- Trạng thái dùng chung toàn hệ thống ----

type Shared = {
  throttle: ThrottleState;
  /** upload ảnh tham chiếu: tối đa 4 file cùng lúc trên toàn hệ thống */
  uploadLimit: Limiter;
  /** xử lý ảnh kết quả bằng sharp (tốn RAM/CPU): tối đa 3 ảnh cùng lúc trên toàn hệ thống */
  finalizeLimit: Limiter;
  /** gửi ảnh vào Zalo: từng ảnh một theo thứ tự, không dồn dập */
  zaloSend: Limiter;
  /** việc đang chạy theo khóa, để nhiều phiên cùng cần một ảnh tham chiếu thì chỉ upload một lần */
  inflight: Map<string, Promise<unknown>>;
};

const g = globalThis as unknown as { __truongminhJobs?: Shared };

export function shared(): Shared {
  return (g.__truongminhJobs ??= {
    throttle: newThrottleState(),
    uploadLimit: createLimiter(4),
    finalizeLimit: createLimiter(3),
    zaloSend: createLimiter(1),
    inflight: new Map(),
  });
}

/** Nếu đã có việc cùng khóa đang chạy thì dùng chung kết quả, không chạy lại. */
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const { inflight } = shared();
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
