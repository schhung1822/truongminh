import "server-only";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { dayKey } from "@/lib/time";
import { checkQuota, remainingQuota } from "./quota";

export function todayKey(now = new Date()): string {
  return dayKey(now, getEnv().APP_TIMEZONE);
}

export async function getUsedToday(userId: string): Promise<number> {
  return db.usageLog.count({ where: { userId, day: todayKey() } });
}

/** Hạn mức chỉ áp dụng cho SALE. Trả về lỗi tiếng Việt nếu không đủ lượt. */
export async function assertQuota(user: Pick<SessionUser, "id" | "role">, needed: number): Promise<string | null> {
  if (user.role === "ADMIN") return null;
  const [{ dailyLimitPerSale }, used] = await Promise.all([getSettings(), getUsedToday(user.id)]);
  return checkQuota(dailyLimitPerSale, used, needed);
}

export async function getQuotaInfo(user: Pick<SessionUser, "id" | "role">) {
  if (user.role === "ADMIN") return null;
  const [{ dailyLimitPerSale }, used] = await Promise.all([getSettings(), getUsedToday(user.id)]);
  return { limit: dailyLimitPerSale, used, left: remainingQuota(dailyLimitPerSale, used) };
}
