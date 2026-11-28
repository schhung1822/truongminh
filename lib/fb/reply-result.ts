import "server-only";
import { db } from "@/lib/db";
import { getFbReplyConfig } from "./reply-config";

/**
 * Cập nhật hàng chờ theo điều extension báo về (v1.0 mục 7.4, v1.1 mục 5.1) và theo những gì lần quét nhìn thấy.
 * Extension KHÔNG bao giờ tự bấm gửi: "sent" nghĩa là sau khi người bấm gửi, câu trả lời đã xuất hiện dưới comment.
 */

export const REPLY_RESULTS = ["filled", "sent", "skipped", "failed"] as const;
export type ReplyResult = (typeof REPLY_RESULTS)[number];

/** Lý do extension báo khi không trả lời được dưới tên fanpage: nhóm không cho, hoặc fanpage không có trong danh sách chuyển danh tính. */
export const PAGE_NOT_AVAILABLE = "page_not_available";

export type ApplyOutcome = { ok: true; status: string; pageJoinedCleared: boolean } | { ok: false; code: "NOT_FOUND" | "BAD_STATE"; message: string };

/** Ghi nhận một câu đã gửi: dòng SENT, comment đánh dấu đã có trả lời, lead ghi lần chào gần nhất (dùng cho chống chào lặp). */
async function markSent(row: { id: string; commentId: string; leadId: string | null; intent: string }, now: Date): Promise<void> {
  await db.$transaction([
    db.fbReplyQueue.update({ where: { id: row.id }, data: { status: "SENT", sentAt: now, failReason: null } }),
    db.fbComment.update({ where: { id: row.commentId }, data: { handled: true } }),
    ...(row.leadId && row.intent === "SUPPLIER_OFFER" ? [db.fbLead.update({ where: { id: row.leadId }, data: { lastOfferedAt: now } })] : []),
  ]);
}

/**
 * Nhóm không cho fanpage trả lời (v1.1 mục 5.1 bước 3): bỏ đánh dấu "page đã vào" của nhóm, rồi xử lý các dòng fanpage còn
 * chờ của nhóm đó theo cấu hình: "account" = chuyển sang nick và đưa về chờ duyệt lại (đổi người đứng tên thì phải duyệt lại),
 * "skip" = bỏ qua.
 */
async function handlePageUnavailable(groupId: string, exceptReplyId: string): Promise<void> {
  const cfg = await getFbReplyConfig();
  await db.fbGroup.update({ where: { id: groupId }, data: { pageJoined: false } });
  const pending = { id: { not: exceptReplyId }, replyAs: "PAGE" as const, status: { in: ["DRAFT", "APPROVED"] as ("DRAFT" | "APPROVED")[] }, comment: { post: { groupId } } };
  if (cfg.fallbackWhenPageUnavailable === "account") {
    await db.fbReplyQueue.updateMany({ where: pending, data: { replyAs: "ACCOUNT", pageId: null, status: "DRAFT", approvedById: null, approvedAt: null } });
  } else {
    await db.fbReplyQueue.updateMany({ where: pending, data: { status: "SKIPPED", failReason: PAGE_NOT_AVAILABLE } });
  }
}

/**
 * Extension báo kết quả một dòng. Chỉ nhận cho dòng của đúng nick gắn với mã kết nối, và chỉ khi dòng đã được duyệt
 * (APPROVED hoặc FILLED): dòng chưa duyệt thì extension không được giao nên không thể có kết quả.
 */
export async function applyReplyResult(input: { replyId: string; accountId: string; tokenId: string; status: ReplyResult; reason: string | null; now?: Date }): Promise<ApplyOutcome> {
  const now = input.now ?? new Date();
  const row = await db.fbReplyQueue.findUnique({
    where: { id: input.replyId },
    select: { id: true, accountId: true, commentId: true, leadId: true, intent: true, status: true, replyAs: true, comment: { select: { postId: true, post: { select: { groupId: true } } } } },
  });
  if (!row || row.accountId !== input.accountId) return { ok: false, code: "NOT_FOUND", message: "Câu trả lời này không thuộc nick của mã kết nối." };
  if (row.status === "SENT") return { ok: true, status: "SENT", pageJoinedCleared: false }; // báo lặp: đã ghi rồi
  if (row.status !== "APPROVED" && row.status !== "FILLED") return { ok: false, code: "BAD_STATE", message: "Câu trả lời này chưa được duyệt hoặc đã bị bỏ qua trên webapp." };

  const reason = input.reason?.trim().slice(0, 200) || null;
  const logDetail = { reply_id: row.id, post_id: row.comment.postId, reply_as: row.replyAs.toLowerCase(), intent: row.intent.toLowerCase() };
  let pageJoinedCleared = false;

  switch (input.status) {
    case "filled":
      await db.fbReplyQueue.update({ where: { id: row.id }, data: { status: "FILLED", filledAt: now, failReason: null } });
      break;
    case "sent":
      await markSent(row, now);
      await db.extLog.create({ data: { tokenId: input.tokenId, type: "REPLY_SENT", detail: logDetail } });
      break;
    case "skipped":
      await db.fbReplyQueue.update({ where: { id: row.id }, data: { status: "SKIPPED", failReason: reason ?? "skipped_in_extension" } });
      break;
    case "failed":
      await db.fbReplyQueue.update({ where: { id: row.id }, data: { status: "FAILED", failReason: reason ?? "unknown" } });
      await db.extLog.create({ data: { tokenId: input.tokenId, type: "REPLY_FAIL", detail: { ...logDetail, reason: reason ?? "unknown" } } });
      if (reason === PAGE_NOT_AVAILABLE && row.replyAs === "PAGE" && row.comment.post.groupId) {
        await handlePageUnavailable(row.comment.post.groupId, row.id);
        pageJoinedCleared = true;
      }
      break;
  }
  return { ok: true, status: input.status.toUpperCase(), pageJoinedCleared };
}

/**
 * Sau mỗi lần quét: comment nào đã có trả lời của nick hoặc fanpage của mình thì đánh dấu "đã có trả lời", và khép dòng hàng chờ
 * của nó. Dòng đang FILLED (extension đã điền, người đã bấm gửi nhưng extension không kịp thấy vì cửa sổ bị đóng) thành SENT;
 * dòng chưa điền (người đã tự trả lời tay) thành SKIPPED để extension không điền thêm câu thứ hai.
 */
export async function reconcileReplied(postId: string, parentFbCommentIds: string[], now: Date): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  const ids = [...new Set(parentFbCommentIds)];
  if (ids.length === 0) return out;
  const parents = await db.fbComment.findMany({
    where: { postId, fbCommentId: { in: ids } },
    select: { id: true, handled: true, reply: { select: { id: true, commentId: true, leadId: true, intent: true, status: true } } },
  });
  const unhandled = parents.filter((p) => !p.handled).map((p) => p.id);
  if (unhandled.length > 0) await db.fbComment.updateMany({ where: { id: { in: unhandled } }, data: { handled: true } });
  for (const p of parents) {
    if (!p.reply) continue;
    if (p.reply.status === "FILLED") {
      await markSent(p.reply, now);
      out.sent++;
    } else if (p.reply.status === "DRAFT" || p.reply.status === "APPROVED") {
      await db.fbReplyQueue.update({ where: { id: p.reply.id }, data: { status: "SKIPPED", failReason: "already_replied" } });
      out.skipped++;
    }
  }
  return out;
}
