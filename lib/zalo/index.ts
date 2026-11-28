import "server-only";
import { randomBytes } from "node:crypto";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { ZaloClient } from "./client";
import { meterFor } from "./usage";

/**
 * Các bot Zalo của hệ thống. Chạy được nhiều bot cùng lúc (docs/DECISIONS.md D116):
 * - bot đặt trong .env (ZALO_BOT_TOKEN): "botId" của nó là null, webhook ở /api/webhooks/zalo;
 * - các bot kết nối ở Hệ thống > Kết nối > Zalo (bảng zalo_bots, token lưu mã hóa), webhook ở /api/webhooks/zalo/<id>.
 * Mỗi nhóm và mỗi hội thoại ghi lại bot của nó (cột botId) để tin gửi đi luôn qua đúng bot đang ở trong cuộc chat đó.
 */

/** Thông báo dùng chung khi chưa có bot nào dùng được. */
export const NO_BOT_MESSAGE = "Chưa kết nối bot Zalo nào (Hệ thống > Kết nối > Zalo), hoặc bot của cuộc chat này đang tắt.";

let envClient: ZaloClient | undefined;

/** Bot đặt trong .env, hoặc null nếu không có ZALO_BOT_TOKEN. */
export function envBotClient(): ZaloClient | null {
  const env = getEnv();
  if (!env.ZALO_BOT_TOKEN) return null;
  return (envClient ??= new ZaloClient(env.ZALO_BOT_TOKEN, env.ZALO_API_BASE, meterFor(null)));
}

/**
 * Tạo client từ token đã mã hóa; null nếu không giải mã được (đổi khóa mã hóa, mất file .secret-key).
 * `botId` = bot của token này: tin gửi qua client được đếm vào hạn mức tháng của bot đó (D133). Bỏ trống thì không đếm
 * (chỉ dùng khi kiểm tra token, đăng ký webhook: các lệnh đó không tốn hạn mức).
 */
export function clientFromEncryptedToken(tokenEnc: string, botId?: string): ZaloClient | null {
  try {
    return new ZaloClient(decryptSecret(tokenEnc), getEnv().ZALO_API_BASE, botId ? meterFor(botId) : undefined);
  } catch {
    return null;
  }
}

/**
 * Client của một bot. Có botId: đúng bot đó, null nếu bot đang tắt. botId trống: bot trong .env; .env không có token thì
 * lấy bot đang bật được kết nối sớm nhất (để nhóm thêm tay và dữ liệu cũ vẫn có bot dùng khi đã bỏ token khỏi .env).
 */
export async function getBotClient(botId?: string | null): Promise<ZaloClient | null> {
  if (botId) {
    const row = await db.zaloBot.findUnique({ where: { id: botId }, select: { tokenEnc: true, isActive: true } });
    return row?.isActive ? clientFromEncryptedToken(row.tokenEnc, botId) : null;
  }
  const fromEnv = envBotClient();
  if (fromEnv) return fromEnv;
  const first = await db.zaloBot.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, tokenEnc: true } });
  return first ? clientFromEncryptedToken(first.tokenEnc, first.id) : null;
}

/** Bot của một cuộc chat, tra theo chat id của Zalo: hội thoại trước, rồi tới nhóm. null = bot trong .env / bot mặc định. */
export async function botIdOfChat(chatId: string): Promise<string | null> {
  const contact = await db.zaloContact.findUnique({ where: { chatId }, select: { botId: true } });
  if (contact?.botId) return contact.botId;
  const group = await db.zaloGroup.findUnique({ where: { chatId }, select: { botId: true } });
  return group?.botId ?? null;
}

/** Client để gửi tin vào một cuộc chat (đúng bot đang ở trong cuộc chat đó). */
export async function getChatClient(chatId: string): Promise<ZaloClient | null> {
  return getBotClient(await botIdOfChat(chatId));
}

/** Có ít nhất một bot dùng được: token trong .env hoặc một bot đang bật trong bảng zalo_bots. */
export async function isZaloConfigured(): Promise<boolean> {
  if (getEnv().ZALO_BOT_TOKEN) return true;
  return (await db.zaloBot.count({ where: { isActive: true } })) > 0;
}

/** Địa chỉ webhook của một bot (botId trống = bot trong .env). */
export function zaloWebhookUrl(botId: string | null): string {
  const base = `${getEnv().APP_URL.replace(/\/+$/, "")}/api/webhooks/zalo`;
  return botId ? `${base}/${botId}` : base;
}

/** Chuỗi bí mật webhook tự sinh cho một bot mới (48 ký tự, trong khoảng 8-256 Zalo cho phép). */
export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

/** Vài ký tự cuối của token để nhận ra key trong danh sách. */
export function tokenHint(token: string): string {
  return token.slice(-4);
}
