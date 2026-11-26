import { after } from "next/server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { processWebhook, type ZaloEvent } from "@/lib/zalo/bot";
import { sameSecret } from "@/lib/zalo/webhook-auth";

/**
 * Webhook của một bot Zalo kết nối ở Hệ thống > Kết nối > Zalo (bảng zalo_bots). Mỗi bot một địa chỉ và một chuỗi bí mật
 * riêng (tự sinh lúc kết nối, lưu mã hóa); Zalo gửi kèm header X-Bot-Api-Secret-Token, phải khớp đúng chuỗi của bot đó.
 * Bot không tồn tại và bot sai bí mật trả cùng một mã 403 để người ngoài không dò được id bot nào có thật.
 * Bot đang tắt vẫn trả 200 (để Zalo không gửi lại mãi) nhưng không xử lý gì.
 */
export async function POST(request: Request, ctx: { params: Promise<{ botId: string }> }) {
  const { botId } = await ctx.params;
  const bot = botId.length <= 40 ? await db.zaloBot.findUnique({ where: { id: botId }, select: { id: true, isActive: true, webhookSecretEnc: true } }) : null;

  let secret: string | null = null;
  if (bot) {
    try {
      secret = decryptSecret(bot.webhookSecretEnc);
    } catch {
      secret = null; // đổi khóa mã hóa: bot này cần kết nối lại
    }
  }
  if (!bot || !sameSecret(request.headers.get("x-bot-api-secret-token"), secret)) return Response.json({ message: "Unauthorized" }, { status: 403 });

  let body: ZaloEvent;
  try {
    body = (await request.json()) as ZaloEvent;
  } catch {
    return Response.json({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  if (bot.isActive) after(() => processWebhook(body, bot.id));
  return Response.json({ message: "Success" });
}
