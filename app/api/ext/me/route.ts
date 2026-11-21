import { authenticateExt } from "@/lib/ext/auth";
import { getFbConfig } from "@/lib/ext/config";

/**
 * Kiểm tra kết nối của extension: trả về tên nhân sự, nick gắn với mã và cấu hình chạy.
 * Xác thực bằng mã kết nối (Bearer), không dùng cookie đăng nhập.
 */
export async function GET(request: Request) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { user, account } = auth.ctx;
  const cfg = await getFbConfig();
  return Response.json(
    {
      user: user.name,
      account: { id: account.id, display_name: account.displayName, profile_url: account.profileUrl, status: account.status },
      config: {
        poll_minutes: cfg.pollMinutes,
        max_posts_per_cycle: cfg.maxPostsPerCycle,
        delay_seconds_between_posts: cfg.delaySecondsBetweenPosts,
      },
      server_time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
