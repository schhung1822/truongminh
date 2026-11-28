import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Câu trả lời giao cho extension (v1.0 mục 7.2 phần `replies`, v1.1 mục 5). Chỉ gồm dòng ĐÃ ĐƯỢC NGƯỜI DUYỆT của đúng nick gắn với
 * mã kết nối. Extension điền câu vào ô trả lời rồi dừng lại; người đọc và tự bấm gửi.
 */

/** Dòng đã điền mà quá lâu không có kết quả (cửa sổ bị đóng, service worker bị tắt) được giao lại. */
const STALE_FILLED_MS = 15 * 60_000;
const MAX_REPLIES = 60;

export type ReplyJob = {
  reply_id: string;
  post_id: string;
  post_url: string;
  fb_comment_id: string;
  parent_fb_comment_id: string | null;
  author_name: string;
  text: string;
  reply_as: "account" | "page";
  page_name: string | null;
  intent: "answer_interest" | "supplier_offer";
};

/** Điều kiện "extension làm được ngay": đã duyệt (hoặc đã điền nhưng treo), bài không thuộc nhóm bị chặn, fanpage (nếu có) đang bật. */
function readyWhere(accountId: string, now: number): Prisma.FbReplyQueueWhereInput {
  return {
    accountId,
    OR: [{ status: "APPROVED" }, { status: "FILLED", filledAt: { lt: new Date(now - STALE_FILLED_MS) } }],
    AND: [
      { OR: [{ replyAs: "ACCOUNT" }, { replyAs: "PAGE", page: { status: "ACTIVE" } }] },
      { comment: { post: { OR: [{ groupId: null }, { group: { status: { not: "BANNED" } } }] } } },
    ],
  };
}

export async function loadReplyJobs(accountId: string, now = Date.now()): Promise<ReplyJob[]> {
  const rows = await db.fbReplyQueue.findMany({
    where: readyWhere(accountId, now),
    orderBy: [{ approvedAt: "asc" }, { id: "asc" }],
    take: MAX_REPLIES,
    select: {
      id: true,
      intent: true,
      replyAs: true,
      draftText: true,
      finalText: true,
      page: { select: { name: true } },
      comment: { select: { fbCommentId: true, parentFbCommentId: true, authorName: true, post: { select: { id: true, url: true } } } },
    },
  });
  const jobs: ReplyJob[] = rows.map((r) => ({
    reply_id: r.id,
    post_id: r.comment.post.id,
    post_url: r.comment.post.url,
    fb_comment_id: r.comment.fbCommentId,
    parent_fb_comment_id: r.comment.parentFbCommentId,
    author_name: r.comment.authorName,
    text: (r.finalText ?? r.draftText).replace(/\s+/g, " ").trim(),
    reply_as: r.replyAs === "PAGE" ? "page" : "account",
    page_name: r.replyAs === "PAGE" ? (r.page?.name ?? null) : null,
    intent: r.intent === "SUPPLIER_OFFER" ? "supplier_offer" : "answer_interest",
  }));
  // Các câu của cùng một bài đứng liền nhau (extension mở bài một lần rồi xử lý lần lượt, v1.1 mục 5.2), giữ thứ tự duyệt
  const firstSeen = new Map<string, number>();
  jobs.forEach((j, i) => {
    if (!firstSeen.has(j.post_id)) firstSeen.set(j.post_id, i);
  });
  return jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => firstSeen.get(a.j.post_id)! - firstSeen.get(b.j.post_id)! || a.i - b.i)
    .map((x) => x.j);
}

/** Số câu đang chờ extension điền, tách theo người đứng tên (popup hiện hai nhóm riêng). */
export async function countReplyJobs(accountId: string, now = Date.now()): Promise<{ account: number; page: number }> {
  const groups = await db.fbReplyQueue.groupBy({ by: ["replyAs"], where: readyWhere(accountId, now), _count: { _all: true } });
  const of = (k: "ACCOUNT" | "PAGE") => groups.find((g) => g.replyAs === k)?._count._all ?? 0;
  return { account: of("ACCOUNT"), page: of("PAGE") };
}
