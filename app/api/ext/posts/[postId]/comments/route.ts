import { db } from "@/lib/db";
import { authenticateExt, extError } from "@/lib/ext/auth";
import { ingestPayloadSchema } from "@/lib/fb/comments";
import { ingestComments } from "@/lib/fb/ingest";

/** Giới hạn kích thước một lần gửi (3000 comment, mỗi comment tối đa vài nghìn ký tự). */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Extension gửi toàn bộ comment đọc được trong một lần quét một bài (docs/thiet-ke-module-lead-facebook.md mục 7.3).
 * Chỉ nhận cho bài có trong danh sách theo dõi của CHÍNH nick gắn với mã: bài của nick khác hoặc bài không có trong
 * danh sách đều trả 404, nên không có đường nào để đẩy dữ liệu của bài người khác vào hệ thống.
 */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { account, token } = auth.ctx;
  if (account.status !== "ACTIVE") return extError(403, "ACCOUNT_INACTIVE", "Nick đang tạm dừng hoặc bị hạn chế, không nhận dữ liệu.");

  const { postId } = await ctx.params;
  const post = await db.fbPost.findUnique({ where: { id: postId }, select: { id: true, accountId: true, groupId: true, purpose: true } });
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
  return Response.json(
    { new_comments: r.newComments, updated_comments: r.updatedComments, new_leads: r.newLeads, lead_sources: r.leadSources },
    { headers: { "Cache-Control": "no-store" } },
  );
}
