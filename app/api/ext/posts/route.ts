import { z } from "zod";
import { authenticateExt, extError } from "@/lib/ext/auth";
import { fold } from "@/lib/fb/phone";
import { registerPost } from "@/lib/fb/register-post";
import { sameProfile } from "@/lib/fb/urls";

const bodySchema = z.object({
  url: z.string().trim().min(1).max(600),
  group_url: z.string().trim().max(300).nullish(),
  content_snapshot: z.string().max(20000).nullish(),
  posted_at: z.string().max(40).nullish(),
  purpose: z.enum(["FIND_CUSTOMER", "FIND_SUPPLIER"]).default("FIND_CUSTOMER"),
  /**
   * Link trang cá nhân của TÁC GIẢ bài, đọc từ chính trang bài. Bắt buộc và phải trùng nick gắn với mã: đây là cách giữ đúng quy tắc
   * "chỉ theo dõi bài do nick của mình đăng". Server không tự kiểm chứng được tác giả, nên extension phải đưa bằng chứng đọc từ trang.
   */
  author_profile_url: z.string().trim().min(1, "Thiếu link tác giả bài đăng.").max(500),
  /** Tên tác giả hiện trên bài. Trong nhóm, link tác giả dùng id số nên có thể không khớp link tên đẹp của nick; khi đó so tên hiển thị. */
  author_name: z.string().trim().max(200).nullish(),
});

/**
 * Nhân sự vừa đăng xong hoặc bấm "Theo dõi bài này" trên popup extension: đăng ký bài vào danh sách theo dõi (mục 7.5).
 * Nhóm chưa có thì tự tạo. Bài của người khác bị từ chối (tác giả không trùng nick của mã).
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

  const nameMatches = !!b.author_name && fold(b.author_name) === fold(account.displayName);
  if (!sameProfile(b.author_profile_url, account.profileUrl) && !nameMatches) {
    return extError(403, "NOT_OWN_POST", "Bài này không phải do nick của mã kết nối đăng, hệ thống chỉ theo dõi bài của chính nick.");
  }

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
