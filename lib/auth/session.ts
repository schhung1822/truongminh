import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { generateToken, hashToken } from "./token";

export const SESSION_COOKIE = "sid";
/** Có chọn "Ghi nhớ đăng nhập": phiên sống 30 ngày, cookie còn sau khi đóng trình duyệt. */
const REMEMBER_DAYS = 30;
/** Không chọn ghi nhớ: cookie mất khi đóng trình duyệt; phiên trong CSDL cũng chỉ sống tối đa 1 ngày (trình duyệt để mở mãi vẫn hết). */
const SHORT_SESSION_HOURS = 24;

/**
 * Tạo phiên đăng nhập mới và đặt cookie. Chỉ gọi được trong Server Action hoặc Route Handler.
 * `remember` (mặc định bật) quyết định phiên dài 30 ngày hay phiên ngắn theo trình duyệt.
 * Ghi lại trình duyệt (User-Agent) để người dùng nhận ra thiết bị ở trang Tài khoản.
 */
export async function createAuthSession(userId: string, opts?: { remember?: boolean }): Promise<void> {
  const remember = opts?.remember ?? true;
  const token = generateToken();
  const ttlMs = remember ? REMEMBER_DAYS * 24 * 60 * 60 * 1000 : SHORT_SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  await db.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.authSession.create({ data: { userId, tokenHash: hashToken(token), expiresAt, userAgent } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    // không đặt hạn = cookie phiên, trình duyệt tự xóa khi đóng
    ...(remember ? { expires: expiresAt } : {}),
  });
}

/** Bản băm token của phiên đang dùng (để nhận ra "thiết bị này"), hoặc null nếu không có cookie. */
export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Đăng xuất: xóa phiên trong CSDL và cookie. */
export async function destroyAuthSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Xóa mọi phiên của một người (khi khóa tài khoản hoặc đặt lại mật khẩu). Trả về số phiên đã xóa. */
export async function revokeUserSessions(userId: string): Promise<number> {
  return (await db.authSession.deleteMany({ where: { userId } })).count;
}

/** Xóa mọi phiên của một người TRỪ phiên đang dùng (tự đổi mật khẩu, "đăng xuất các thiết bị khác"). Trả về số phiên đã xóa. */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const keep = await currentSessionHash();
  return (await db.authSession.deleteMany({ where: { userId, ...(keep ? { tokenHash: { not: keep } } : {}) } })).count;
}
