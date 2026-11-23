"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { syncPinterestAccount } from "@/lib/pinterest/sync";

export type PinterestActionResult = { error?: string; ok?: string };

export async function syncPinterestAction(): Promise<PinterestActionResult> {
  await requireAdmin();
  const account = await db.pinterestAccount.findFirst({ select: { id: true } });
  if (!account) return { error: "Chưa kết nối tài khoản Pinterest nào." };
  try {
    const r = await syncPinterestAccount(account.id);
    revalidatePath("/admin/pinterest");
    return { ok: `Đã đồng bộ ${r.boards} board, ${r.pins} pin.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Đồng bộ thất bại." };
  }
}

/**
 * Ngắt kết nối: xóa tài khoản + board + pin đã đồng bộ (CASCADE). Ảnh thiết kế đã tạo xong trước đó không bị ảnh hưởng
 * (ảnh đã lưu rồi); phiên đang chờ tạo mà có chọn ảnh phong cách sẽ tự bỏ qua ảnh đó, vẫn ra ảnh bình thường.
 */
export async function disconnectPinterestAction(): Promise<PinterestActionResult> {
  await requireAdmin();
  const account = await db.pinterestAccount.findFirst({ select: { id: true } });
  if (!account) return { error: "Chưa kết nối tài khoản Pinterest nào." };
  await db.pinterestAccount.delete({ where: { id: account.id } });
  revalidatePath("/admin/pinterest");
  return { ok: "Đã ngắt kết nối Pinterest." };
}
