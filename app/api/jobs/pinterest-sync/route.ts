import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { syncPinterestAccount } from "@/lib/pinterest/sync";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Đồng bộ lại board/pin của (các) tài khoản Pinterest đã kết nối, để không phải vào /admin/pinterest bấm tay.
 * Dành cho máy chủ VPS gọi định kỳ, ví dụ mỗi 6 giờ:
 *   curl -fsS -X POST -H "x-cron-secret: $PINTEREST_SYNC_CRON_SECRET" https://tên-miền/api/jobs/pinterest-sync
 * Cần PINTEREST_SYNC_CRON_SECRET trong .env. Không qua đăng nhập (xem proxy.ts) nên khóa là bắt buộc.
 */
export async function POST(request: Request) {
  const { PINTEREST_SYNC_CRON_SECRET: secret } = getEnv();
  if (!secret) return Response.json({ message: "Chưa bật đường gọi này." }, { status: 404 });
  const given = request.headers.get("x-cron-secret");
  if (!given || !sameSecret(given, secret)) return Response.json({ message: "Unauthorized" }, { status: 403 });

  const accounts = await db.pinterestAccount.findMany({ select: { id: true, username: true } });
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const r = await syncPinterestAccount(account.id);
        return { username: account.username, ...r };
      } catch (e) {
        return { username: account.username, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return Response.json({ accounts: results }, { headers: { "Cache-Control": "no-store" } });
}
