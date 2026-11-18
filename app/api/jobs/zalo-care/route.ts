import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { runCareCycle } from "@/lib/zalo/care";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Chạy một vòng chăm sóc tự động: lên kịch bản cho ngày mai (nếu chưa có) và đăng các bài đã tới giờ.
 * Dành cho máy chủ VPS gọi định kỳ, ví dụ mỗi 10 phút:
 *   curl -fsS -X POST -H "x-cron-secret: $ZALO_CARE_CRON_SECRET" https://tên-miền/api/jobs/zalo-care
 * Cần ZALO_CARE_CRON_SECRET trong .env và bật "Tự động đăng" ở Quản trị > Zalo. Không qua đăng nhập (xem proxy.ts) nên khóa là bắt buộc.
 */
export async function POST(request: Request) {
  const { ZALO_CARE_CRON_SECRET: secret } = getEnv();
  if (!secret) return Response.json({ message: "Chưa bật đường gọi này." }, { status: 404 });
  const given = request.headers.get("x-cron-secret");
  if (!given || !sameSecret(given, secret)) return Response.json({ message: "Unauthorized" }, { status: 403 });

  const r = await runCareCycle();
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
