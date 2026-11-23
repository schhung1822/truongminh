/**
 * "Giữ chỗ" bài đang được một máy quét, để hai máy cùng dùng một nick (hai mã kết nối cùng một nick) không mở cùng một bài
 * cùng lúc. Lưu trong bộ nhớ: web chạy một tiến trình duy nhất (PM2 instances: 1); khởi động lại là mất, hậu quả xấu nhất chỉ là
 * một bài bị quét hai lần (dữ liệu vẫn không trùng nhờ chống trùng theo mã comment).
 */
export type Lease = { tokenId: string; until: number };

export type LeaseStore = Map<string, Lease>;

/** Thời gian giữ chỗ: đủ cho một bài quét lâu nhất (tải trang + 3 phút mở rộng) cộng chờ giữa các bài. */
export const SCAN_LEASE_MS = 12 * 60_000;

const defaultStore: LeaseStore = new Map();

/**
 * Lọc các bài máy này được phép quét (chưa ai giữ chỗ, hoặc chỗ đã hết hạn, hoặc chính máy này giữ) và giữ chỗ cho chúng.
 * Trả về đúng thứ tự đầu vào.
 */
export function acquireScanLeases<T extends { id: string }>(posts: T[], tokenId: string, now = Date.now(), store: LeaseStore = defaultStore, ttlMs = SCAN_LEASE_MS): T[] {
  // dọn chỗ đã hết hạn để Map không phình
  for (const [id, l] of store) if (l.until <= now) store.delete(id);
  const out: T[] = [];
  for (const p of posts) {
    const l = store.get(p.id);
    if (l && l.tokenId !== tokenId && l.until > now) continue;
    store.set(p.id, { tokenId, until: now + ttlMs });
    out.push(p);
  }
  return out;
}

/** Máy quét xong (hoặc bỏ dở) một bài thì trả chỗ, để máy khác được quét sớm hơn thay vì chờ hết hạn. */
export function releaseScanLease(postId: string, tokenId: string, store: LeaseStore = defaultStore): void {
  const l = store.get(postId);
  if (l && l.tokenId === tokenId) store.delete(postId);
}
