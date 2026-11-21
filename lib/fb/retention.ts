import "server-only";
import { db } from "@/lib/db";
import { getFbConfig } from "@/lib/ext/config";

const DAY = 24 * 60 * 60 * 1000;
/** Nhật ký quét bình thường giữ 30 ngày; cảnh báo selector_broken / checkpoint giữ lâu hơn để còn tra cứu. */
const ROUTINE_LOG_DAYS = 30;
const WARNING_LOG_DAYS = 180;

export type RetentionResult = { commentsDeleted: number; logsDeleted: number; retentionDays: number };

/**
 * Dọn dữ liệu cũ theo thời hạn lưu (docs/thiet-ke-module-lead-facebook.md mục 11):
 * - Comment loại Khác và Spam quá `retentionDays` ngày thì xoá (0 = không xoá). Không xoá comment đã sinh lead hoặc là nguồn của lead.
 * - Nhật ký extension cũ.
 * Chạy bằng cron của máy chủ qua POST /api/jobs/fb-retention. Chạy lại bao nhiêu lần cũng an toàn.
 */
export async function purgeOldData(now = Date.now()): Promise<RetentionResult> {
  const cfg = await getFbConfig();
  let commentsDeleted = 0;

  if (cfg.retentionDays > 0) {
    const cutoff = new Date(now - cfg.retentionDays * DAY);
    const where = { category: { in: ["OTHER", "SPAM"] as ("OTHER" | "SPAM")[] }, createdAt: { lt: cutoff }, lead: null, sources: { none: {} } };
    const posts = await db.fbComment.findMany({ where, select: { postId: true }, distinct: ["postId"] });
    commentsDeleted = (await db.fbComment.deleteMany({ where })).count;
    for (const { postId } of posts) {
      const commentCount = await db.fbComment.count({ where: { postId } });
      await db.fbPost.update({ where: { id: postId }, data: { commentCount } });
    }
  }

  const routine = await db.extLog.deleteMany({ where: { type: { in: ["SCAN_OK", "SCAN_FAIL"] }, createdAt: { lt: new Date(now - ROUTINE_LOG_DAYS * DAY) } } });
  const warnings = await db.extLog.deleteMany({ where: { type: { notIn: ["SCAN_OK", "SCAN_FAIL"] }, createdAt: { lt: new Date(now - WARNING_LOG_DAYS * DAY) } } });
  return { commentsDeleted, logsDeleted: routine.count + warnings.count, retentionDays: cfg.retentionDays };
}
