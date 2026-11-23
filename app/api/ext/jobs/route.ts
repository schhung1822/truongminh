import { db } from "@/lib/db";
import { authenticateExt } from "@/lib/ext/auth";
import { getFbConfig } from "@/lib/ext/config";
import { acquireScanLeases } from "@/lib/fb/lease";
import { needsFullScan, pickPostsToScan, shouldMarkDone } from "@/lib/fb/schedule";

/** Số mã comment đã biết gửi kèm mỗi bài (để extension biết phần nào đã có). */
const MAX_KNOWN_IDS = 3000;
/**
 * Việc cần làm cho nick của mã này. Giai đoạn 1 chỉ có `scan` (đọc comment); `replies` và `post_tasks` luôn rỗng.
 * Chỉ giao bài đã được người dùng chủ động thêm vào danh sách theo dõi của nick quét này.
 * Nick tạm dừng hoặc bị hạn chế (checkpoint) thì không giao việc.
 */
export async function GET(request: Request) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { account, token } = auth.ctx;
  const headers = { "Cache-Control": "no-store" };

  if (account.status !== "ACTIVE") {
    return Response.json({ scan: [], replies: [], post_tasks: [], paused_reason: account.status }, { headers });
  }

  const cfg = await getFbConfig();
  const now = Date.now();
  const tracking = await db.fbPost.findMany({
    where: { accountId: account.id, trackingStatus: "TRACKING", OR: [{ groupId: null }, { group: { status: { not: "BANNED" } } }] },
    select: { id: true, url: true, postedAt: true, createdAt: true, lastScannedAt: true, lastFullScannedAt: true, lastCommentAt: true, reportedCommentCount: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Bài lâu không có comment mới thì tự chuyển "Đã xong" (tính lười ngay khi hỏi việc, không cần việc định kỳ riêng)
  const done = tracking.filter((p) => shouldMarkDone(p, now, cfg));
  if (done.length > 0) {
    await db.fbPost.updateMany({ where: { id: { in: done.map((p) => p.id) } }, data: { trackingStatus: "DONE" } });
  }
  const doneIds = new Set(done.map((p) => p.id));

  // ?force=1: nhân sự bấm "Quét ngay" trên popup, bỏ qua chu kỳ nhưng vẫn giữ giới hạn số bài mỗi lần
  const force = new URL(request.url).searchParams.get("force") === "1";
  const picks = pickPostsToScan(
    tracking.filter((p) => !doneIds.has(p.id)),
    now,
    cfg,
    { force },
  );
  // Hai máy cùng một nick (hai mã kết nối) không được giao cùng một bài trong lúc máy kia đang quét
  const scan = [];
  for (const p of acquireScanLeases(picks, token.id, now)) {
    const known = await db.fbComment.findMany({ where: { postId: p.id }, select: { fbCommentId: true }, take: MAX_KNOWN_IDS });
    scan.push({
      post_id: p.id,
      url: p.url,
      known_comment_ids: known.map((k) => k.fbCommentId),
      reported_comment_count: p.reportedCommentCount,
      force_full_scan: needsFullScan(p.lastFullScannedAt, now),
    });
  }

  return Response.json({ scan, replies: [], post_tasks: [] }, { headers });
}
