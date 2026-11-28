import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { dayKey } from "@/lib/time";
import type { ZaloMeter } from "./client";

/**
 * Đếm số tin mỗi bot đã gửi trong tháng (docs/DECISIONS.md D133). Zalo không có lệnh hỏi "còn bao nhiêu tin", nên hệ thống
 * tự đếm mỗi lần gọi Zalo gửi tin/ảnh/file thành công và nhớ lần gần nhất Zalo trả lỗi 429 (hết hạn mức tháng).
 * Con số chỉ gồm tin gửi qua hệ thống này, kể từ lúc bắt đầu đếm; tháng tính theo múi giờ của web.
 */

/** Khóa của bot đặt trong .env (bot đó không có dòng trong bảng zalo_bots). */
export const ENV_BOT_KEY = "env";

export const botKeyOf = (botId: string | null | undefined) => botId || ENV_BOT_KEY;

/** "2026-11" theo múi giờ của web. */
export function monthKey(now = new Date()): string {
  return dayKey(now, getEnv().APP_TIMEZONE).slice(0, 7);
}

async function record(botKey: string, event: "sent" | "quota"): Promise<void> {
  const month = monthKey();
  const now = new Date();
  const where = { botKey_month: { botKey, month } };
  // gửi được lại nghĩa là hạn mức đã có trở lại: bỏ dấu "hết hạn mức"
  const update = event === "sent" ? { sent: { increment: 1 }, quotaHitAt: null } : { quotaHitAt: now };
  try {
    await db.zaloBotUsage.upsert({ where, create: { botKey, month, sent: event === "sent" ? 1 : 0, quotaHitAt: event === "quota" ? now : null }, update });
  } catch (e) {
    // hai tin đầu tháng gửi sát nhau cùng tạo dòng: bên thua cập nhật lại vào dòng vừa có
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await db.zaloBotUsage.update({ where, data: update }).catch(() => {});
      return;
    }
    console.error("Zalo: không ghi được số tin đã gửi:", e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 200) : e);
  }
}

/** Bộ đếm gắn vào client của một bot. Ghi nền, không bao giờ làm hỏng hay làm chậm việc gửi tin. */
export function meterFor(botId: string | null): ZaloMeter {
  const key = botKeyOf(botId);
  return (event) => void record(key, event).catch(() => {});
}

export type BotUsage = {
  /** số tin đã gửi trong tháng này (do hệ thống đếm) */
  sent: number;
  /** lần gần nhất Zalo báo hết hạn mức trong tháng này */
  quotaHitAt: Date | null;
  /** bắt đầu đếm từ lúc này; sau ngày 1 của tháng nghĩa là số đếm của tháng này chưa đủ */
  since: Date | null;
};

/** Số tin tháng này của mọi bot, tra theo khóa bot (botKeyOf). Bot chưa gửi tin nào thì không có trong bảng. */
export async function loadBotUsage(): Promise<Map<string, BotUsage>> {
  const rows = await db.zaloBotUsage.findMany({ where: { month: monthKey() } });
  return new Map(rows.map((r) => [r.botKey, { sent: r.sent, quotaHitAt: r.quotaHitAt, since: r.createdAt }]));
}
