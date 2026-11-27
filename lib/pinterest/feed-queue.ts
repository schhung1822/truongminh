import "server-only";
import { db } from "@/lib/db";
import { getZaloSettings } from "@/lib/zalo/settings";

/**
 * Hàng đợi gửi pin mới vào nhóm Zalo (docs/DECISIONS.md D127). Tách riêng khỏi zalo-feed.ts để phần đồng bộ (sync.ts)
 * xếp hàng được mà hai file không phải nhập lẫn nhau. Việc gửi do vòng theo dõi ở zalo-feed.ts làm.
 */

/** Chức năng đang chạy = công tắc tổng của Zalo và công tắc "Gửi mẫu Pinterest mới vào nhóm" cùng bật. */
export async function pinFeedEnabled(): Promise<boolean> {
  const s = await getZaloSettings();
  return s.enabled && s.pinFeed;
}

/**
 * Xếp hàng gửi các pin (theo đúng thứ tự đưa vào) tới mọi nhóm đang bật nhận mẫu. Mỗi cặp (pin, nhóm) chỉ có một dòng,
 * nên pin đã từng xếp hàng hay đã gửi vào nhóm nào thì không lặp lại ở nhóm đó. Chức năng đang tắt thì không xếp gì:
 * bật lại sau không dội cả loạt pin cũ vào nhóm. Trả về số lượt gửi vừa xếp.
 */
export async function queuePinsForZalo(pinIds: string[]): Promise<number> {
  if (pinIds.length === 0 || !(await pinFeedEnabled())) return 0;
  const groups = await db.zaloGroup.findMany({ where: { isActive: true, pinFeed: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (groups.length === 0) return 0;
  const r = await db.pinterestPinDelivery.createMany({
    data: pinIds.flatMap((pinId) => groups.map((g) => ({ pinId, groupId: g.id }))),
    skipDuplicates: true,
  });
  return r.count;
}

/**
 * Bắt đầu lại từ đầu: gọi khi chức năng vừa được BẬT lại. Lượt gửi còn chờ từ trước bị hủy, và mọi board đang theo dõi
 * bị xóa mốc "lần xem gần nhất" để lần hỏi kế tiếp chỉ nhập pin (xem canAnnounce): pin lưu trong lúc tắt không bị gửi.
 */
export async function restartPinFeed(): Promise<void> {
  await db.$transaction([
    db.pinterestPinDelivery.updateMany({ where: { status: "PENDING" }, data: { status: "FAILED", error: "Chức năng bị tắt trước khi kịp gửi." } }),
    db.pinterestBoard.updateMany({ where: { zaloFeed: true }, data: { feedCheckedAt: null } }),
  ]);
}
