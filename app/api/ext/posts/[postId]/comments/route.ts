import { after } from "next/server";
import { db } from "@/lib/db";
import { authenticateExt, extError } from "@/lib/ext/auth";
import { ingestPayloadSchema } from "@/lib/fb/comments";
import { ingestComments } from "@/lib/fb/ingest";
import { releaseScanLease } from "@/lib/fb/lease";
import { runSupplierAi } from "@/lib/fb/offers";

/** Giới hạn kích thước một lần gửi (3000 comment, mỗi comment tối đa vài nghìn ký tự). */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Extension gửi toàn bộ comment đọc được trong một lần quét một bài (docs/thiet-ke-module-lead-facebook.md mục 7.3).
 * Chỉ nhận cho bài có trong danh sách theo dõi của nick quét gắn với mã. Bài không được người dùng đăng ký hoặc được
 * đăng ký cho nick quét khác vẫn trả 404.
 */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { account, token } = auth.ctx;
  if (account.status !== "ACTIVE") return extError(403, "ACCOUNT_INACTIVE", "Nick đang tạm dừng hoặc bị hạn chế, không nhận dữ liệu.");

  const { postId } = await ctx.params;
  const post = await db.fbPost.findUnique({ where: { id: postId }, select: { id: true, url: true, accountId: true, groupId: true, purpose: true } });
  if (!post || post.accountId !== account.id) return extError(404, "NOT_FOUND", "Bài này không có trong danh sách theo dõi của nick.");

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return extError(413, "TOO_LARGE", "Dữ liệu gửi lên quá lớn.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return extError(400, "BAD_REQUEST", "Dữ liệu không phải JSON hợp lệ.");
  }
  const parsed = ingestPayloadSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return extError(400, "BAD_REQUEST", `${issue.path.join(".") || "dữ liệu"}: ${issue.message}`);
  }

  const r = await ingestComments({ post, account, tokenId: token.id, payload: parsed.data });
  if (parsed.data.complete) releaseScanLease(post.id, token.id); // quét xong thì trả chỗ cho máy khác cùng nick (nếu có)

  // AI xếp loại nhà sản xuất và soạn câu mời (v1.1 mục 4.2) chạy SAU khi đã trả lời extension: mỗi comment một lượt hỏi AI,
  // không để extension phải chờ. Câu soạn từ mẫu đã có sẵn trong hàng chờ từ bước ingest, nên AI lỗi cũng không mất gì.
  if (r.aiCommentIds.length > 0) {
    const commentIds = r.aiCommentIds;
    after(() => runSupplierAi({ postId: post.id, commentIds }).catch((e) => console.error(`AI nhà sản xuất (bài ${post.id}) lỗi:`, e)));
  }

  return Response.json(
    { new_comments: r.newComments, updated_comments: r.updatedComments, new_leads: r.newLeads, lead_sources: r.leadSources, new_replies: r.newReplies },
    { headers: { "Cache-Control": "no-store" } },
  );
}
