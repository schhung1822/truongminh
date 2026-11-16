import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "./session";
import { hashToken } from "./token";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * Người đang đăng nhập (hoặc null). Kiểm tra thật trong CSDL mỗi request:
 * khóa tài khoản hoặc xóa phiên là mất quyền ngay.
 * `cache` của React chỉ gộp các lần gọi trong CÙNG một request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await connection(); // phiên đăng nhập luôn đọc lúc có request, không dựng sẵn
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
    },
  });
  if (!session || session.expiresAt.getTime() < Date.now() || !session.user.isActive) {
    return null;
  }
  const { id, email, name, role } = session.user;
  return { id, email, name, role };
});

/** Dùng trong trang và Server Action: chưa đăng nhập thì chuyển về /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Chỉ ADMIN. SALE bị đưa về trang chính. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
