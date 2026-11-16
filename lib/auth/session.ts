import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { generateToken, hashToken } from "./token";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

/** Tạo phiên đăng nhập mới và đặt cookie. Chỉ gọi được trong Server Action hoặc Route Handler. */
export async function createAuthSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.authSession.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
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

/** Xóa mọi phiên của một người (khi khóa tài khoản hoặc đặt lại mật khẩu). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.authSession.deleteMany({ where: { userId } });
}
