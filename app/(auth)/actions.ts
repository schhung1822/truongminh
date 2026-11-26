"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity, pruneActivityLogs } from "@/lib/activity";
import { CHANGE_PASSWORD_PATH, getSessionUser, requireSignedIn } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { createAuthSession, destroyAuthSession, revokeOtherSessions } from "@/lib/auth/session";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { clearFailures, isLocked, recordFailure } from "@/lib/auth/rate-limit";

/** `email`: trả lại email vừa nhập khi đăng nhập không thành công, để ô email không bị xóa trắng. */
export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: "Vui lòng nhập email hợp lệ và mật khẩu.", email: typedEmail };

  const { email, password } = parsed.data;
  // Ô "Ghi nhớ đăng nhập 30 ngày": bỏ chọn thì phiên hết khi đóng trình duyệt (lib/auth/session.ts).
  const remember = formData.get("remember") !== "0";
  if (isLocked(email)) {
    return { error: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.", email: typedEmail };
  }

  const user = await db.user.findUnique({ where: { email } });
  // Luôn so sánh mật khẩu (kể cả khi không có user) để thời gian phản hồi không lộ email nào tồn tại.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.isActive || !ok) {
    recordFailure(email);
    // Chỉ ghi nhật ký cho email CÓ tài khoản: mỗi email tối đa 5 lần sai / 15 phút nên bảng nhật ký không bị bơm rác
    // bằng cách thử hàng loạt email bịa. Thông báo trả về vẫn giống nhau cho mọi trường hợp.
    if (user) {
      await logActivity({
        actorName: email,
        action: "LOGIN_FAILED",
        target: `${user.name} (${user.email})`,
        detail: `${!user.isActive ? "Tài khoản đang bị khóa" : "Sai mật khẩu"}${isLocked(email) ? ". Đã tạm chặn đăng nhập email này 15 phút" : ""}`,
      });
    }
    return { error: "Email hoặc mật khẩu không đúng.", email: typedEmail };
  }

  clearFailures(email);
  await createAuthSession(user.id, { remember });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logActivity({ actor: user, action: "LOGIN", detail: remember ? "Ghi nhớ 30 ngày" : "Phiên ngắn (hết khi đóng trình duyệt)" });
  void pruneActivityLogs();
  redirect(user.mustChangePassword ? CHANGE_PASSWORD_PATH : "/");
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  await destroyAuthSession();
  if (user) await logActivity({ actor: user, action: "LOGOUT" });
  redirect("/login");
}

export type FirstPasswordState = { error?: string };

/**
 * Đặt mật khẩu mới ở lần đăng nhập đầu (hoặc sau khi quản trị viên đặt lại mật khẩu): tài khoản đang mang cờ
 * mustChangePassword. Không hỏi lại mật khẩu cũ vì người dùng vừa đăng nhập bằng chính mật khẩu tạm đó
 * (đặt lại mật khẩu luôn xóa mọi phiên cũ). Mật khẩu mới phải khác mật khẩu tạm.
 */
export async function setFirstPasswordAction(_prev: FirstPasswordState, formData: FormData): Promise<FirstPasswordState> {
  const user = await requireSignedIn();
  if (!user.mustChangePassword) redirect("/account");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "Hai lần nhập mật khẩu mới chưa giống nhau." };

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row) redirect("/login");
  if (await verifyPassword(password, row.passwordHash)) return { error: "Mật khẩu mới phải khác mật khẩu tạm quản trị viên đã cấp." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: false } });
  await revokeOtherSessions(user.id);
  await logActivity({ actor: user, action: "PASSWORD_CHANGE", detail: "Đặt mật khẩu riêng thay cho mật khẩu tạm" });
  redirect("/");
}
