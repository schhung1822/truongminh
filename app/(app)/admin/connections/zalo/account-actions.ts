"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { connectAccount, disconnectAccount } from "@/lib/zalo/personal/manager";

type Result = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/admin/connections", "layout");
  revalidatePath("/zalo");
}

/** Kết nối lại một tài khoản bằng cookie đã lưu (không cần quét QR nếu phiên còn hạn). */
export async function connectAccountAction(id: string): Promise<Result> {
  await requireAdmin();
  const r = await connectAccount(id);
  if (r.ok) await db.zaloAccount.update({ where: { id }, data: { autoConnect: true } }).catch(() => {});
  refresh();
  return r.ok ? { ok: "Đã kết nối." } : { error: r.error };
}

export async function disconnectAccountAction(id: string): Promise<Result> {
  await requireAdmin();
  await disconnectAccount(id);
  await db.zaloAccount.update({ where: { id }, data: { autoConnect: false } }).catch(() => {});
  refresh();
  return { ok: "Đã ngắt kết nối. Máy chủ sẽ không tự nối lại tài khoản này cho tới khi bạn kết nối lại." };
}

/** Xóa tài khoản và toàn bộ hội thoại, tin nhắn của nó trong Hộp thư (không thể khôi phục). */
export async function removeAccountAction(id: string): Promise<Result> {
  const admin = await requireAdmin();
  await disconnectAccount(id);
  const removed = await db.zaloAccount.delete({ where: { id }, select: { name: true, phone: true } }).catch(() => null);
  if (removed) await logActivity({ actor: admin, action: "ZALO_ACCOUNT_REMOVE", target: removed.phone ? `${removed.name} (${removed.phone})` : removed.name });
  refresh();
  return { ok: "Đã xóa tài khoản và các hội thoại của nó." };
}

export async function renameAccountAction(id: string, name: string): Promise<Result> {
  await requireAdmin();
  const n = name.trim().slice(0, 150);
  if (!n) return { error: "Tên không được để trống." };
  await db.zaloAccount.update({ where: { id }, data: { name: n } });
  refresh();
  return { ok: "Đã đổi tên." };
}
