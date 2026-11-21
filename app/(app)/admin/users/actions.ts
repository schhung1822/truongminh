"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { ASSIGNABLE_ROLES, roleLabel, type AssignableRole } from "@/lib/roles";

export type FormState = { error?: string; ok?: string };

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`)
  .max(72, "Mật khẩu tối đa 72 ký tự.");

const createSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên.").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Email không hợp lệ.")),
  password: passwordSchema,
  role: z.enum(ASSIGNABLE_ROLES, "Vai trò không hợp lệ."),
});

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? "SALE",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { name, email, password, role } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    return { error: "Email này đã có tài khoản." };
  }
  await db.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
  });
  revalidatePath("/admin/users");
  return { ok: `Đã tạo tài khoản ${roleLabel(role)} cho ${name}.` };
}

/** Đổi vai trò giữa Sale và Marketing. Không đổi vai trò quản trị viên, không tự đổi của mình. */
export async function setUserRoleAction(userId: string, role: AssignableRole): Promise<FormState> {
  const admin = await requireAdmin();
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) return { error: "Vai trò không hợp lệ." };
  if (userId === admin.id) return { error: "Bạn không thể tự đổi vai trò của mình." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };
  if (user.role === "ADMIN") return { error: "Không đổi vai trò của quản trị viên ở đây." };

  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  return { ok: `${user.name} giờ là ${roleLabel(role)}.` };
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<FormState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: "Bạn không thể tự khóa tài khoản của mình." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };

  await db.user.update({ where: { id: userId }, data: { isActive } });
  if (!isActive) await revokeUserSessions(userId); // khóa là mất quyền ngay
  revalidatePath("/admin/users");
  return { ok: isActive ? "Đã mở khóa tài khoản." : "Đã khóa tài khoản." };
}

export async function resetPasswordAction(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "Không tìm thấy tài khoản." };

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data) },
  });
  await revokeUserSessions(userId); // buộc đăng nhập lại bằng mật khẩu mới
  revalidatePath("/admin/users");
  return { ok: "Đã đổi mật khẩu. Người dùng cần đăng nhập lại." };
}
