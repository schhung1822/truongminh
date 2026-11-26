"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/roles";

export type FormState = { error?: string; ok?: string };

const nameSchema = z.string().trim().min(1, "Vui lòng nhập tên.").max(100, "Tên tối đa 100 ký tự.");
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Email không hợp lệ."));
const roleSchema = z.enum(ASSIGNABLE_ROLES, "Vai trò không hợp lệ.");

const who = (u: { name: string; email: string }) => `${u.name} (${u.email})`;

/**
 * Tạo tài khoản (mọi vai trò, kể cả quản trị viên). Mật khẩu nhập ở đây chỉ là mật khẩu TẠM: người dùng buộc phải tự
 * đặt mật khẩu riêng ở lần đăng nhập đầu (cờ mustChangePassword), nên quản trị viên không biết mật khẩu thật của ai.
 */
export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = z.object({ name: nameSchema, email: emailSchema, role: roleSchema }).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role") ?? "SALE",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const { name, email, role } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    return { error: "Email này đã có tài khoản." };
  }
  await db.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await logActivity({ actor: admin, action: "USER_CREATE", target: who({ name, email }), detail: `Vai trò: ${roleLabel(role)}` });
  revalidatePath("/admin/users");
  return { ok: `Đã tạo tài khoản ${roleLabel(role)} cho ${name}. Người này sẽ phải tự đặt mật khẩu mới khi đăng nhập lần đầu.` };
}

/**
 * Sửa tên, email và vai trò của một tài khoản. Không tự đổi vai trò của chính mình: nhờ vậy luôn còn ít nhất một quản trị
 * viên (chính người đang thao tác), không thể lỡ tay hạ quyền quản trị viên cuối cùng.
 */
export async function updateUserAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = z.object({ name: nameSchema, email: emailSchema, role: roleSchema }).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, role } = parsed.data;

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };
  if (userId === admin.id && role !== user.role) return { error: "Bạn không thể tự đổi vai trò của mình. Nhờ một quản trị viên khác." };
  if (email !== user.email && (await db.user.findUnique({ where: { email }, select: { id: true } }))) {
    return { error: "Email này đã thuộc về một tài khoản khác." };
  }

  const infoChanged = name !== user.name || email !== user.email;
  const roleChanged = role !== user.role;
  if (!infoChanged && !roleChanged) return { ok: "Không có gì thay đổi." };

  await db.user.update({ where: { id: userId }, data: { name, email, role } });
  if (infoChanged) {
    const parts = [name !== user.name ? `tên: ${user.name} → ${name}` : null, email !== user.email ? `email: ${user.email} → ${email}` : null].filter(Boolean);
    await logActivity({ actor: admin, action: "USER_UPDATE", target: who(user), detail: parts.join("; ") });
  }
  if (roleChanged) {
    await logActivity({ actor: admin, action: "USER_ROLE", target: who({ name, email }), detail: `${roleLabel(user.role)} → ${roleLabel(role)}` });
  }
  revalidatePath("/admin/users");
  return { ok: roleChanged ? `Đã lưu. ${name} giờ là ${roleLabel(role)}.` : "Đã lưu." };
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<FormState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "Bạn không thể tự khóa tài khoản của mình." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };

  await db.user.update({ where: { id: userId }, data: { isActive } });
  if (!isActive) await revokeUserSessions(userId); // khóa là mất quyền ngay
  await logActivity({ actor: admin, action: isActive ? "USER_UNLOCK" : "USER_LOCK", target: who(user) });
  revalidatePath("/admin/users");
  return { ok: isActive ? "Đã mở khóa tài khoản." : "Đã khóa tài khoản." };
}

/**
 * Quản trị viên đặt lại mật khẩu cho người khác: đây là mật khẩu TẠM, người đó bị đăng xuất khỏi mọi thiết bị và phải
 * tự đặt mật khẩu riêng ở lần đăng nhập kế tiếp. Mật khẩu của chính mình thì đổi ở trang Tài khoản của tôi.
 */
export async function resetPasswordAction(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "Mật khẩu của chính bạn thì đổi ở trang Tài khoản của tôi (bấm vào tên bạn ở góc phải)." };
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await revokeUserSessions(userId); // buộc đăng nhập lại bằng mật khẩu tạm
  await logActivity({ actor: admin, action: "PASSWORD_RESET", target: who(user) });
  revalidatePath("/admin/users");
  return { ok: "Đã đặt mật khẩu tạm. Người dùng bị đăng xuất và sẽ phải tự đặt mật khẩu mới khi đăng nhập lại." };
}

/** Đăng xuất một người khỏi mọi thiết bị (nghi lộ tài khoản, mất máy). Của chính mình thì làm ở trang Tài khoản của tôi. */
export async function logoutUserEverywhereAction(userId: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "Thiết bị của chính bạn thì quản lý ở trang Tài khoản của tôi." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };

  const count = await revokeUserSessions(userId);
  if (count > 0) await logActivity({ actor: admin, action: "SESSIONS_REVOKE", target: who(user), detail: `${count} thiết bị` });
  revalidatePath("/admin/users");
  return { ok: count > 0 ? `Đã đăng xuất ${user.name} khỏi ${count} thiết bị.` : `${user.name} không đăng nhập trên thiết bị nào.` };
}
