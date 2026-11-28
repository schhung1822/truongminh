"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { loadReplyEnv } from "@/lib/fb/offers";

export type ReplyActionResult = { error?: string; ok?: string };

const idsSchema = z.array(z.string().min(1)).min(1, "Chưa chọn dòng nào.").max(200, "Chọn tối đa 200 dòng một lần.");
const MAX_TEXT = 1000;

/** Marketing chỉ xử lý câu trả lời của bài do nick của mình quét (giống trang Bài đăng); quản trị viên xử lý tất cả. */
function scope(user: Pick<SessionUser, "id" | "role">): Prisma.FbReplyQueueWhereInput {
  return user.role === "ADMIN" ? {} : { account: { userId: user.id } };
}

function done(result: ReplyActionResult): ReplyActionResult {
  revalidatePath("/fb/replies");
  return result;
}

/** Sửa câu trả lời trước khi extension điền. Câu đã duyệt mà sửa thì vẫn giữ trạng thái đã duyệt (người sửa chính là người duyệt). */
export async function saveReplyTextAction(id: string, text: string): Promise<ReplyActionResult> {
  const user = await requireFbManager();
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { error: "Câu trả lời không được để trống." };
  if (clean.length > MAX_TEXT) return { error: `Câu trả lời tối đa ${MAX_TEXT} ký tự.` };
  const row = await db.fbReplyQueue.findFirst({ where: { id, ...scope(user) }, select: { status: true, draftText: true } });
  if (!row) return { error: "Không tìm thấy câu trả lời." };
  if (row.status !== "DRAFT" && row.status !== "APPROVED") return { error: "Chỉ sửa được câu đang chờ duyệt hoặc đã duyệt." };
  await db.fbReplyQueue.update({ where: { id }, data: { finalText: clean === row.draftText ? null : clean } });
  return done({ ok: "Đã lưu câu trả lời." });
}

/**
 * Duyệt một hoặc nhiều câu (duyệt cả lô). Chỉ câu đang chờ duyệt mới đổi. Câu đứng tên fanpage mà fanpage đã bị gỡ hoặc đang tạm
 * dừng thì không duyệt, vì extension sẽ không điền được.
 */
export async function approveRepliesAction(ids: string[]): Promise<ReplyActionResult> {
  const user = await requireFbManager();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rows = await db.fbReplyQueue.findMany({
    where: { id: { in: parsed.data }, status: "DRAFT", ...scope(user) },
    select: { id: true, replyAs: true, page: { select: { status: true } } },
  });
  const ready = rows.filter((r) => r.replyAs === "ACCOUNT" || r.page?.status === "ACTIVE").map((r) => r.id);
  const blocked = rows.length - ready.length;
  if (ready.length > 0) await db.fbReplyQueue.updateMany({ where: { id: { in: ready }, status: "DRAFT" }, data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), failReason: null } });
  if (ready.length === 0) return { error: blocked > 0 ? "Không duyệt được: fanpage của các câu này đã bị gỡ hoặc đang tạm dừng. Đổi sang trả lời bằng nick, hoặc bật lại fanpage." : "Không có câu nào đang chờ duyệt trong các dòng đã chọn." };
  return done({ ok: `Đã duyệt ${ready.length} câu.${blocked > 0 ? ` ${blocked} câu chưa duyệt vì fanpage không dùng được.` : ""} Mở extension và bấm Xử lý trả lời để điền vào Facebook.` });
}

/** Bỏ duyệt: đưa câu đã duyệt (chưa điền) về chờ duyệt. */
export async function unapproveRepliesAction(ids: string[]): Promise<ReplyActionResult> {
  const user = await requireFbManager();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await db.fbReplyQueue.updateMany({ where: { id: { in: parsed.data }, status: "APPROVED", ...scope(user) }, data: { status: "DRAFT", approvedById: null, approvedAt: null } });
  if (r.count === 0) return { error: "Không có câu nào đang ở trạng thái đã duyệt." };
  return done({ ok: `Đã bỏ duyệt ${r.count} câu.` });
}

/** Bỏ qua: không trả lời các comment này. */
export async function skipRepliesAction(ids: string[]): Promise<ReplyActionResult> {
  const user = await requireFbManager();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await db.fbReplyQueue.updateMany({
    where: { id: { in: parsed.data }, status: { in: ["DRAFT", "APPROVED", "FAILED"] }, ...scope(user) },
    data: { status: "SKIPPED", failReason: "skipped_on_web" },
  });
  if (r.count === 0) return { error: "Không có câu nào bỏ qua được trong các dòng đã chọn." };
  return done({ ok: `Đã bỏ qua ${r.count} câu.` });
}

/** Đưa câu đã bỏ qua, bị lỗi, hoặc đã điền mà chưa gửi về lại chờ duyệt (để sửa rồi duyệt lại). */
export async function restoreRepliesAction(ids: string[]): Promise<ReplyActionResult> {
  const user = await requireFbManager();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await db.fbReplyQueue.updateMany({
    where: { id: { in: parsed.data }, status: { in: ["SKIPPED", "FAILED", "FILLED"] }, comment: { handled: false }, ...scope(user) },
    data: { status: "DRAFT", failReason: null, approvedById: null, approvedAt: null, filledAt: null },
  });
  if (r.count === 0) return { error: "Không có câu nào khôi phục được (comment đã có trả lời thì không soạn lại)." };
  return done({ ok: `Đã đưa ${r.count} câu về chờ duyệt.` });
}

/**
 * Đổi người đứng tên của một câu: nick đã quét bài, hoặc fanpage mặc định. Đổi xong câu về chờ duyệt, vì người duyệt cần thấy
 * đúng danh tính sẽ trả lời. Dùng khi nhóm không cho fanpage trả lời (lỗi page_not_available).
 */
export async function setReplyIdentityAction(id: string, replyAs: "ACCOUNT" | "PAGE"): Promise<ReplyActionResult> {
  const user = await requireFbManager();
  if (replyAs !== "ACCOUNT" && replyAs !== "PAGE") return { error: "Lựa chọn không hợp lệ." };
  const row = await db.fbReplyQueue.findFirst({ where: { id, ...scope(user) }, select: { status: true } });
  if (!row) return { error: "Không tìm thấy câu trả lời." };
  if (row.status === "SENT" || row.status === "FILLED") return { error: "Câu đã điền hoặc đã gửi thì không đổi được người đứng tên." };

  let pageId: string | null = null;
  if (replyAs === "PAGE") {
    const env = await loadReplyEnv();
    if (!env.defaultPage) return { error: "Chưa có fanpage mặc định đang bật. Thêm fanpage ở trang Mẫu câu & Fanpage trước." };
    pageId = env.defaultPage.id;
  }
  await db.fbReplyQueue.update({ where: { id }, data: { replyAs, pageId, status: "DRAFT", failReason: null, approvedById: null, approvedAt: null } });
  return done({ ok: replyAs === "PAGE" ? "Đã đổi sang trả lời bằng fanpage. Duyệt lại để extension điền." : "Đã đổi sang trả lời bằng nick. Duyệt lại để extension điền." });
}
