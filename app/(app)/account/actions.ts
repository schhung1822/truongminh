"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/dal";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { clearFailures, isLocked, recordFailure } from "@/lib/auth/rate-limit";
import { revokeOtherSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type AccountState = { error?: string; ok?: string };

/**
 * Người dùng tự đổi mật khẩu của mình: phải nhập đúng mật khẩu hiện tại. Đổi xong, mọi thiết bị KHÁC bị đăng xuất
 * (thiết bị đang dùng thì giữ). Nhập sai mật khẩu hiện tại quá 5 lần trong 15 phút thì tạm chặn, để ai đó ngồi vào máy
 * đang mở sẵn không dò được mật khẩu.
 */
export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const limitKey = `pw:${user.id}`;
  if (isLocked(limitKey)) return { error: "Nhập sai mật khẩu hiện tại quá nhiều lần. Vui lòng thử lại sau 15 phút." };

  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "Hai lần nhập mật khẩu mới chưa giống nhau." };

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    recordFailure(limitKey);
    return { error: "Mật khẩu hiện tại không đúng." };
  }
  clearFailures(limitKey);
  if (current === password) return { error: "Mật khẩu mới phải khác mật khẩu hiện tại." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: false } });
  const others = await revokeOtherSessions(user.id);
  await logActivity({ actor: user, action: "PASSWORD_CHANGE", detail: others > 0 ? `Đã đăng xuất ${others} thiết bị khác` : null });
  revalidatePath("/account");
  return { ok: others > 0 ? `Đã đổi mật khẩu và đăng xuất ${others} thiết bị khác.` : "Đã đổi mật khẩu." };
}

/** Đăng xuất mọi thiết bị khác của chính mình, giữ thiết bị đang dùng. */
export async function logoutOtherDevicesAction(): Promise<AccountState> {
  const user = await requireUser();
  const others = await revokeOtherSessions(user.id);
  if (others > 0) await logActivity({ actor: user, action: "SESSIONS_REVOKE", target: "Chính mình", detail: `${others} thiết bị khác` });
  revalidatePath("/account");
  return { ok: others > 0 ? `Đã đăng xuất ${others} thiết bị khác.` : "Không có thiết bị nào khác đang đăng nhập." };
}
