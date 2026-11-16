"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createAuthSession, destroyAuthSession } from "@/lib/auth/session";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { clearFailures, isLocked, recordFailure } from "@/lib/auth/rate-limit";

export type LoginState = { error?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Vui lòng nhập email hợp lệ và mật khẩu." };

  const { email, password } = parsed.data;
  if (isLocked(email)) {
    return { error: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." };
  }

  const user = await db.user.findUnique({ where: { email } });
  // Luôn so sánh mật khẩu (kể cả khi không có user) để thời gian phản hồi không lộ email nào tồn tại.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.isActive || !ok) {
    recordFailure(email);
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  clearFailures(email);
  await createAuthSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyAuthSession();
  redirect("/login");
}
