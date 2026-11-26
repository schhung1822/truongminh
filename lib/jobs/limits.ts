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

/**
 * Điều kiện "lượt có tính vào hạn mức": ảnh tạo LỖI thì không tính (được trả lại lượt ngay khi ảnh chuyển sang lỗi), ảnh đang
 * chờ, đang tạo và đã xong thì tính. Dòng không còn gắn với ảnh nào (ảnh đã bị xóa) vẫn tính như cũ.
 * Bảng usage_logs vẫn ghi đủ mọi lần bấm tạo, chỉ cách ĐẾM hạn mức là bỏ ảnh lỗi (docs/DECISIONS.md D119).
 */
export const COUNTED_USAGE = { OR: [{ imageId: null }, { image: { status: { not: "FAILED" as const } } }] };

/** Số lượt hôm nay đã tính vào hạn mức của một người (không gồm ảnh lỗi). */
export async function getUsedToday(userId: string): Promise<number> {
  return db.usageLog.count({ where: { userId, day: todayKey(), ...COUNTED_USAGE } });
}

/** Hạn mức áp dụng cho mọi tài khoản trừ quản trị viên (Sale và Marketing). Trả về lỗi tiếng Việt nếu không đủ lượt. */
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
