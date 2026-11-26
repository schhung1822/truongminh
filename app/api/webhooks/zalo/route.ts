import { after } from "next/server";
import { getEnv } from "@/lib/env";
import { processWebhook, type ZaloEvent } from "@/lib/zalo/bot";
import { sameSecret } from "@/lib/zalo/webhook-auth";

/**
 * Webhook của bot Zalo đặt trong .env: nhận tin khách nhắn bot và tin trong nhóm có @bot (xem lib/zalo/bot.ts để biết cách xử lý:
 * ghép nối, lệnh gõ nhanh, lệnh tag bot của nhân viên, nhận ra nhóm để gửi ảnh).
 * Các bot kết nối ở Hệ thống > Kết nối > Zalo có địa chỉ riêng: /api/webhooks/zalo/<id bot> (xem thư mục [botId]).
 * Zalo gửi kèm header X-Bot-Api-Secret-Token = ZALO_WEBHOOK_SECRET, phải khớp mới nhận.
 * Đường dẫn /api/webhooks/* không cần đăng nhập (xem proxy.ts) nên việc kiểm tra bí mật là bắt buộc.
 * Trả 200 ngay, việc xử lý (có thể mất vài giây khi gọi AI) chạy nền bằng after().
 */
export async function POST(request: Request) {
  const { ZALO_WEBHOOK_SECRET: secret } = getEnv();
  if (!secret) return Response.json({ message: "Webhook Zalo chưa được bật." }, { status: 404 });

  if (!sameSecret(request.headers.get("x-bot-api-secret-token"), secret)) return Response.json({ message: "Unauthorized" }, { status: 403 });

  let body: ZaloEvent;
  try {
    body = (await request.json()) as ZaloEvent;
  } catch {
    return Response.json({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  after(() => processWebhook(body, null));
  return Response.json({ message: "Success" });
}
