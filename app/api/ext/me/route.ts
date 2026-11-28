import { authenticateExt } from "@/lib/ext/auth";
import { db } from "@/lib/db";
import { getFbConfig } from "@/lib/ext/config";
import { countReplyJobs } from "@/lib/fb/reply-jobs";

/**
 * Kiểm tra kết nối của extension: trả về tên nhân sự, nick gắn với mã, cấu hình chạy, số câu trả lời đã duyệt đang chờ điền
 * (tách theo nick / fanpage) và tên các fanpage đang bật (extension dùng để che tên trong báo cáo chẩn đoán).
 * Xác thực bằng mã kết nối (Bearer), không dùng cookie đăng nhập.
 */
export async function GET(request: Request) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { user, account } = auth.ctx;
  const active = account.status === "ACTIVE";
  const [cfg, replies, pages] = await Promise.all([
    getFbConfig(),
    active ? countReplyJobs(account.id) : Promise.resolve({ account: 0, page: 0 }),
    db.fbPage.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { name: true } }),
  ]);
  return Response.json(
    {
      user: user.name,
      account: { id: account.id, display_name: account.displayName, profile_url: account.profileUrl, status: account.status },
      config: {
        poll_minutes: cfg.pollMinutes,
        max_posts_per_cycle: cfg.maxPostsPerCycle,
        delay_seconds_between_posts: cfg.delaySecondsBetweenPosts,
      },
      replies,
      pages: pages.map((p) => p.name),
      server_time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
