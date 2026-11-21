import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { purgeOldData } from "@/lib/fb/retention";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Dọn dữ liệu cũ của module Lead Facebook (comment Khác/Spam quá hạn, nhật ký extension cũ). Dành cho máy chủ VPS gọi mỗi ngày:
 *   curl -fsS -X POST -H "x-cron-secret: $FB_CRON_SECRET" https://tên-miền/api/jobs/fb-retention
 * Cần FB_CRON_SECRET trong .env. Không qua đăng nhập (xem proxy.ts) nên khóa là bắt buộc.
 */
export async function POST(request: Request) {
  const { FB_CRON_SECRET: secret } = getEnv();
  if (!secret) return Response.json({ message: "Chưa bật đường gọi này." }, { status: 404 });
  const given = request.headers.get("x-cron-secret");
  if (!given || !sameSecret(given, secret)) return Response.json({ message: "Unauthorized" }, { status: 403 });

  const r = await purgeOldData();
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
