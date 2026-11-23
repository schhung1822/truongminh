import { z } from "zod";
import { authenticateExt, extError } from "@/lib/ext/auth";
import { registerPost } from "@/lib/fb/register-post";

const bodySchema = z.object({
  url: z.string().trim().min(1).max(600),
  group_url: z.string().trim().max(300).nullish(),
  content_snapshot: z.string().max(20000).nullish(),
  posted_at: z.string().max(40).nullish(),
  purpose: z.enum(["FIND_CUSTOMER", "FIND_SUPPLIER"]).default("FIND_CUSTOMER"),
  /** Thông tin tác giả chỉ dùng để chẩn đoán phía extension; bài không cần thuộc nick đang quét. */
  author_profile_url: z.string().trim().max(500).nullish(),
  author_name: z.string().trim().max(200).nullish(),
});

/**
 * Người dùng bấm "Theo dõi bài này" trên popup extension: đăng ký permalink vào danh sách theo dõi.
 * Nhóm chưa có thì tự tạo. Nick gắn với mã là nick dùng để mở bài và quét những comment mà nick đó nhìn thấy.
 */
export async function POST(request: Request) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { account, user } = auth.ctx;
  if (account.status !== "ACTIVE") return extError(403, "ACCOUNT_INACTIVE", "Nick đang tạm dừng hoặc bị hạn chế.");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return extError(400, "BAD_REQUEST", "Dữ liệu không phải JSON hợp lệ.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return extError(400, "BAD_REQUEST", `${parsed.error.issues[0].path.join(".") || "dữ liệu"}: ${parsed.error.issues[0].message}`);
  const b = parsed.data;

  const postedAt = b.posted_at ? new Date(b.posted_at) : null;
  const r = await registerPost({
    url: b.url,
    accountId: account.id,
    purpose: b.purpose,
    registeredById: user.id,
    contentSnapshot: b.content_snapshot,
    groupUrl: b.group_url,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) && postedAt.getTime() <= Date.now() ? postedAt : null,
  });
  if (!r.ok) return extError(400, "BAD_REQUEST", r.error);
  return Response.json({ post_id: r.postId, created: r.created }, { status: r.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
}
