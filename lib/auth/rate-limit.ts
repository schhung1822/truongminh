// Chặn dò mật khẩu: tối đa MAX lần sai trong WINDOW cho mỗi email, lưu trong bộ nhớ.
// Chạy một bản app duy nhất nên không cần kho dùng chung. Khởi động lại là xóa sạch.
const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;

const fails = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

export function isLocked(key: string, now = Date.now()): boolean {
  return recent(key, now).length >= MAX;
}

export function recordFailure(key: string, now = Date.now()): void {
  const list = recent(key, now);
  list.push(now);
  fails.set(key, list);
}

export function clearFailures(key: string): void {
  fails.delete(key);
}
