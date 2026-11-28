import { z } from "zod";
import { authenticateExt, extError } from "@/lib/ext/auth";
import { applyReplyResult, REPLY_RESULTS } from "@/lib/fb/reply-result";

const bodySchema = z.object({
  status: z.string().transform((s) => s.trim().toLowerCase()).pipe(z.enum(REPLY_RESULTS, "Trạng thái không hợp lệ.")),
  /** Lý do khi failed / skipped. v1.0 gọi là `detail`, v1.1 gọi là `fail_reason`: nhận cả hai. */
  detail: z.string().trim().max(200).nullish(),
  fail_reason: z.string().trim().max(200).nullish(),
});

/**
 * Extension báo kết quả một câu trả lời (docs/thiet-ke-module-lead-facebook.md mục 7.4, v1.1 mục 5.1):
 * `filled` = đã điền vào ô trả lời và đang chờ người bấm gửi; `sent` = sau khi người bấm gửi, đã thấy câu trả lời xuất hiện;
 * `skipped` = người dùng bỏ qua; `failed` kèm lý do (ví dụ `page_not_available`: không trả lời được dưới tên fanpage ở nhóm đó,
 * khi đó webapp bỏ đánh dấu "page đã vào" của nhóm). Extension không bao giờ tự bấm gửi.
 */
export async function POST(request: Request, ctx: { params: Promise<{ replyId: string }> }) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { account, token } = auth.ctx;
  if (account.status !== "ACTIVE") return extError(403, "ACCOUNT_INACTIVE", "Nick đang tạm dừng hoặc bị hạn chế, không nhận dữ liệu.");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return extError(400, "BAD_REQUEST", "Dữ liệu không phải JSON hợp lệ.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return extError(400, "BAD_REQUEST", parsed.error.issues[0].message);

  const { replyId } = await ctx.params;
  const r = await applyReplyResult({ replyId, accountId: account.id, tokenId: token.id, status: parsed.data.status, reason: parsed.data.fail_reason ?? parsed.data.detail ?? null });
  if (!r.ok) return r.code === "NOT_FOUND" ? extError(404, "NOT_FOUND", r.message) : extError(409, "BAD_REQUEST", r.message);
  return Response.json({ ok: true, status: r.status.toLowerCase(), page_joined_cleared: r.pageJoinedCleared }, { headers: { "Cache-Control": "no-store" } });
}
